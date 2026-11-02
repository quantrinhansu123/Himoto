import 'server-only';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {canEditIssuedContract} from '@/lib/management/contract-profile';
import {hasPermission,type PermissionAccount} from '@/lib/management/permissions';
import {findPaymentAccount,paymentAccountMatchesMethod} from '@/lib/management/contract-payments';
import type {ReceiptCorrectionInput,ReceiptCorrectionState} from '@/lib/management/receipt-corrections';
import {ContractPaymentError,readPaymentContext} from './contract-payments';
type DB=Pick<PoolClient,'query'>;
const eligible=`t.status='approved' AND t.type IN ('in','addon') AND (t.name IN ('order:deposit','order:additional_deposit','order:rental_fees','order:payment') OR t.name LIKE 'order:deposit:%') AND NOT EXISTS(SELECT 1 FROM himoto.management_contract_payments p WHERE p.transaction_id=t.id AND p.renewal_payload IS NOT NULL)`;
const money=(v:unknown)=>typeof v==='string'&&/^(0|[1-9]\d{0,12})$/.test(v);
function allowed(user:PermissionAccount){if(!canEditIssuedContract(user)&&!hasPermission(user,'finance.write'))throw new ContractPaymentError('Tài khoản chưa có quyền sửa hợp đồng hoặc khoản thu.',403);}
export function parseReceiptCorrection(body:unknown):ReceiptCorrectionInput {
 if(!body||typeof body!=='object'||Array.isArray(body))throw new ContractPaymentError('Thông tin sửa khoản thu không hợp lệ.');
 const v=body as ReceiptCorrectionInput;
 if(Object.keys(v).some(k=>!['request_id','revision','deposit_amount','reason','receipts'].includes(k))||typeof v.request_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.request_id)||typeof v.revision!=='string'||!/^\d{1,20}$/.test(v.revision)||!money(v.deposit_amount)||typeof v.reason!=='string'||!v.reason.trim()||v.reason.trim().length>500||!Array.isArray(v.receipts)||v.receipts.length>100)throw new ContractPaymentError('Kiểm tra số tiền cọc, phiên bản hợp đồng và lý do sửa.');
 const ids=new Set<number>();
 for(const r of v.receipts){
  if(!r||typeof r!=='object'||Object.keys(r).some(k=>!['id','revision','deposit','paid_at','parts'].includes(k))||!Number.isSafeInteger(r.id)||r.id<=0||ids.has(r.id)||typeof r.revision!=='string'||!/^\d{1,20}$/.test(r.revision)||typeof r.deposit!=='boolean'||typeof r.paid_at!=='string'||!Array.isArray(r.parts)||!r.parts.length||r.parts.length>10)throw new ContractPaymentError('Danh sách phiếu cần sửa không hợp lệ.');
  ids.add(r.id);let sum=0;
  for(const p of r.parts){if(!p||typeof p!=='object'||Object.keys(p).some(k=>!['amount','method','account_id'].includes(k))||!money(p.amount)||!['cash','transfer','company_transfer'].includes(p.method)||!Number.isSafeInteger(p.account_id)||p.account_id<0)throw new ContractPaymentError(`Phiếu #${r.id}: số tiền hoặc hình thức nhận không hợp lệ.`);sum+=Number(p.amount);}
  if(sum>9999999999999)throw new ContractPaymentError('Tổng khoản thu vượt giới hạn.');
 }
 return {...v,request_id:v.request_id.toLowerCase(),reason:v.reason.trim()};
}
async function order(db:DB,id:number,user:PermissionAccount,lock=false){
 allowed(user);if(!Number.isSafeInteger(id)||id<=0)throw new ContractPaymentError('Mã hợp đồng không hợp lệ.');
 const o=(await db.query(`SELECT *,xmin::text AS revision FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL${lock?' FOR UPDATE':''}`,[id])).rows[0];
 if(!o)throw new ContractPaymentError('Không tìm thấy hợp đồng trong cơ sở được phân quyền.',404);
 if(['draft','cancelled'].includes(o.order_status))throw new ContractPaymentError('Chỉ sửa khoản thu của hợp đồng đã phát hành, chưa hủy.',409);
 return o;
}
export async function readReceiptCorrections(db:DB,id:number,user:PermissionAccount):Promise<ReceiptCorrectionState>{
 const o=await order(db,id,user),context=await readPaymentContext(db,id);
 const rows=(await db.query(`SELECT t.id,t.xmin::text AS revision FROM himoto.transactions t WHERE t.order_id=$1 AND ${eligible} ORDER BY t.id`,[id])).rows;
 return {revision:o.revision,code:context.code,deposit_amount:String(Number(o.first_deposit_amount||0)+Number(o.additional_deposit_amount||0)),accounts:context.accounts,receipts:rows.map(r=>{const h=context.history.find(h=>h.id===Number(r.id))!;return {id:Number(r.id),revision:r.revision,deposit:h.deposit,paid_at:h.paid_at,parts:[{amount:String(h.amount),method:h.payment_method||'cash',account_id:h.account_id||0}]};})};
}
export async function updateReceiptCorrections(db:DB,id:number,user:PermissionAccount&{id:number},body:unknown){
 const input=parseReceiptCorrection(body);await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='20s'");
 const o=await order(db,id,user,true),payload=structuredClone(o.draft_payload||{}),composer=payload.management_composer||{},history=Array.isArray(composer.receipt_corrections)?composer.receipt_corrections:[];
 const hash=createHash('sha256').update(JSON.stringify({actor:user.id,...input,revision:undefined})).digest('hex'),prior=history.find((h:{request_id:string})=>h.request_id===input.request_id);
 if(prior){if(prior.hash!==hash)throw new ContractPaymentError('Mã lần sửa đã dùng cho nội dung khác.',409);return readReceiptCorrections(db,id,user);}
 if(o.revision!==input.revision)throw new ContractPaymentError('Hợp đồng vừa thay đổi. Đóng rồi mở lại cửa sổ để tải dữ liệu mới.',409);
 if(o.pid==null||!Number.isSafeInteger(Number(o.pid))||Number(o.pid)<0)throw new ContractPaymentError('Tổng đã thu chưa được đối chiếu. Cần xác minh số gốc trước khi sửa.',409);
 const rows=(await db.query(`SELECT t.*,t.xmin::text AS revision FROM himoto.transactions t WHERE t.order_id=$1 AND ${eligible} ORDER BY t.id FOR UPDATE OF t`,[id])).rows;
 if(rows.length!==input.receipts.length||rows.some(t=>!input.receipts.some(r=>r.id===Number(t.id)&&r.revision===t.revision)))throw new ContractPaymentError('Danh sách phiếu thu vừa thay đổi. Tải lại trước khi sửa.',409);
 if((await db.query("SELECT 1 FROM himoto.management_contract_notifications WHERE order_id=$1 AND status IN ('pending','sending','unknown') LIMIT 1",[id])).rowCount)throw new ContractPaymentError('Telegram đang gửi hoặc chưa xác định kết quả. Xử lý lượt gửi trước khi sửa.',409);
 for(const r of input.receipts)for(const p of r.parts)if(p.account_id)await db.query(`SELECT id FROM himoto.${p.method==='cash'?'cash':'banks'} WHERE id=$1 FOR SHARE`,[p.account_id]);
 const context=await readPaymentContext(db,id);let delta=0,deposit=0;const inserted:number[]=[],before:unknown[]=[],after:unknown[]=[];
 for(const t of rows){
  const r=input.receipts.find(r=>r.id===Number(t.id))!,old=context.history.find(h=>h.id===r.id)!;
  if(r.deposit!==old.deposit||r.paid_at!==old.paid_at||Number(t.store_id)!==Number(o.store_id))throw new ContractPaymentError('Không được đổi loại phiếu, ngày thu hoặc cơ sở khi sửa cách chia tiền.',409);
  const amount=r.parts.reduce((n,p)=>n+Number(p.amount),0);delta+=amount-Number(t.value);if(old.deposit)deposit+=amount;
  const original={amount:String(t.value),method:old.payment_method||'cash',account_id:old.account_id||0};
  if(r.parts.length===1&&r.parts[0].amount===original.amount&&r.parts[0].method===original.method&&r.parts[0].account_id===original.account_id)continue;
  before.push(t);
  for(const [index,p] of r.parts.entries()){
   const account=p.account_id?findPaymentAccount(context,p.method,p.account_id):undefined;if(p.account_id&&(!account||!paymentAccountMatchesMethod(account,p.method)))throw new ContractPaymentError('Tài khoản nhận không hoạt động hoặc không đúng hình thức / cơ sở hợp đồng.',409);
   const values=[p.amount,p.method==='cash'?null:account?.id??null,p.method==='cash'?account?.id??null:null,p.method==='cash'?1:2,p.method==='cash'?null:p.method==='company_transfer'?'company':'personal'];
   if(index===0){const changed=await db.query('UPDATE himoto.transactions SET value=$1,bank_id=$2,cash_id=$3,payment_method=$4,bank_owner_type=$5,updated_at=now() WHERE id=$6 AND order_id=$7 RETURNING id',[...values,t.id,id]);if(changed.rowCount!==1)throw new ContractPaymentError('Không đủ quyền sửa phiếu thu.',409);}
   else {const result=await db.query(`INSERT INTO himoto.transactions(value,bank_id,cash_id,payment_method,bank_owner_type,order_id,created_at,updated_at,name,type,note,status,user_id,store_id,object_type,object_id,order_item_id) VALUES($1,$2,$3,$4,$5,$6,$7,now(),$8,$9,$10,'approved',$11,$12,$13,$14,$15) RETURNING id`,[...values,id,t.created_at,t.name,t.type,t.note,user.id,t.store_id,t.object_type,t.object_id,t.order_item_id]);inserted.push(Number(result.rows[0].id));}
  }
  after.push(r);
 }
 if(deposit>Number(input.deposit_amount)||deposit<context.deposit_refunded)throw new ContractPaymentError('Cọc đã thu không được vượt cọc hợp đồng hoặc thấp hơn cọc đã hoàn.',409);
 if(!Number.isSafeInteger(Number(o.pid)+delta)||Number(o.pid)+delta<0||Number(o.pid)+delta>9999999999999)throw new ContractPaymentError('Tổng tiền đã thu không hợp lệ.',409);
 if(!before.length&&Number(input.deposit_amount)===Number(o.first_deposit_amount||0)+Number(o.additional_deposit_amount||0))throw new ContractPaymentError('Tiền cọc và khoản thu chưa thay đổi.');
 payload.management_composer={...composer,draft:{...composer.draft,deposit_amount:input.deposit_amount},receipt_corrections:[...history,{request_id:input.request_id,hash,at:new Date().toISOString(),actor_id:user.id,reason:input.reason,before_deposit:Number(o.first_deposit_amount||0)+Number(o.additional_deposit_amount||0),after_deposit:Number(input.deposit_amount),before,after,inserted_transaction_ids:inserted}]};
 const result=await db.query(`UPDATE himoto.orders SET first_deposit_amount=$2,additional_deposit_amount=0,pid=pid+$3,draft_payload=$4::json,contract_snapshot=NULL,updated_at=now() WHERE id=$1 RETURNING id`,[id,input.deposit_amount,delta,JSON.stringify(payload)]);
 if(result.rowCount!==1)throw new ContractPaymentError('Không đủ quyền sửa hợp đồng.',409);
 return readReceiptCorrections(db,id,user);
}
