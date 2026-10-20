import 'server-only';
import { createHash,randomUUID,timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { bankBin } from '@/lib/management/transfer-qr';
import { branchQrAccounts,defaultBranchQrAccount,contractTransferMemo,contractVietQr,plainBankText,type ContractQrData } from '@/lib/management/sepay';
import { MAX_PAYMENT_AMOUNT,PAYABLE_STATUSES } from '@/lib/management/contract-payments';
import { readPaymentContext,recordContractPayment } from './contract-payments';
type Database=Pick<PoolClient,'query'>;
export class SePayError extends Error {constructor(message:string,public status=400){super(message);}}
export function sepayConfig(env:NodeJS.ProcessEnv=process.env){
  const mode=env.SEPAY_MODE||'test';if(!['test','live'].includes(mode))throw new SePayError('Chế độ SePay chưa hợp lệ.',503);
  const bank={bank_code:(env.SEPAY_BANK_CODE||'').trim(),account_number:(env.SEPAY_ACCOUNT_NUMBER||'').replace(/\s/g,''),account_name:(env.SEPAY_ACCOUNT_NAME||'').trim()};
  const configured=Boolean(bankBin(bank.bank_code)&&/^[A-Za-z0-9]{1,32}$/.test(bank.account_number)&&bank.account_name);
  const bankId=Number(env.SEPAY_BANK_ID||0),actorId=Number(env.SEPAY_SERVICE_USER_ID||0);
  return {mode:mode as 'test'|'live',bank,configured,bankId,actorId,secret:env.SEPAY_WEBHOOK_SECRET||''};
}
export function validSePayAuthorization(header:string|null,secret:string){
  if(!secret||secret.length<8||!header||header.length>512)return false;
  const token=header.match(/^Apikey\s+(.+)$/i)?.[1]||'';const a=Buffer.from(token),b=Buffer.from(secret);
  return a.length===b.length&&timingSafeEqual(a,b);
}
export interface SePayPayload {id:string;amount:number;direction:'in'|'out';account:string;gateway:string;content:string;reference:string;at:string;fingerprint:string}
/** SePay's dashboard send-test uses a mock ID and sample account, not a bank transaction. */
export function isSePayConnectivityTest(raw:unknown):boolean {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;
  const body=raw as Record<string,unknown>;
  if(body.id!==0&&body.id!=='0')return false;
  const amount=typeof body.transferAmount==='number'?body.transferAmount:typeof body.transferAmount==='string'&&/^\d+$/.test(body.transferAmount)?Number(body.transferAmount):NaN;
  return ['gateway','transactionDate','accountNumber'].every(key=>typeof body[key]==='string'&&String(body[key]).trim().length>0&&String(body[key]).length<=100)
    &&['in','out'].includes(String(body.transferType))&&Number.isSafeInteger(amount)&&amount>=0&&amount<=MAX_PAYMENT_AMOUNT;
}
export function parseSePayPayload(raw:unknown):SePayPayload {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new SePayError('Dữ liệu webhook không hợp lệ.');
  const body=raw as Record<string,unknown>,id=String(body.id??''),amount=typeof body.transferAmount==='number'?body.transferAmount:/^\d+$/.test(String(body.transferAmount))?Number(body.transferAmount):NaN;
  const direction=body.transferType,account=typeof body.accountNumber==='string'?body.accountNumber.replace(/\s/g,''):'',content=typeof body.content==='string'?body.content.trim():'';
  const reference=typeof body.referenceCode==='string'?body.referenceCode:'';
  const gateway=typeof body.gateway==='string'?body.gateway.trim():'';
  if(!gateway||gateway.length>100)throw new SePayError('Thiếu ngân hàng giao dịch.');
  const date=typeof body.transactionDate==='string'?body.transactionDate:'';
  if(!/^[1-9]\d{0,19}$/.test(id)||typeof body.id==='number'&&!Number.isSafeInteger(body.id)||!Number.isSafeInteger(amount)||amount<=0||amount>MAX_PAYMENT_AMOUNT||!['in','out'].includes(String(direction))||!account||account.length>100||content.length>2000||reference.length>200||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(date))throw new SePayError('Thiếu hoặc sai thông tin giao dịch SePay.');
  const at=`${date.replace(' ','T')}+07:00`,time=Date.parse(at);
  if(!Number.isFinite(time)||new Date(time+7*3600000).toISOString().slice(0,19)!==date.replace(' ','T'))throw new SePayError('Thời gian giao dịch không hợp lệ.');
  const fingerprint=createHash('sha256').update(JSON.stringify([id,amount,direction,account,bankBin(gateway)||gateway,content,reference,at])).digest('hex');
  return {id,amount,direction:direction as 'in'|'out',account,gateway,content,reference,at,fingerprint};
}
const compact=(value:string)=>plainBankText(value).toUpperCase().replace(/[^A-Z0-9]/g,'');
export function memoMatchesContract(content:string,code:string){
  const key=compact(code);if(!key)return false;
  const prefix='THANHTOANCHOHOPDONG'.split('').join('[^A-Z0-9]*');
  return new RegExp(prefix+'[^A-Z0-9]*'+key.split('').join('[^A-Z0-9]*')+'(?=$|[^A-Z0-9])').test(plainBankText(content).toUpperCase());
}
export async function readContractQr(client:Database,id:number,requestedAmount?:number,accountId?:number):Promise<ContractQrData>{
  const context=await readPaymentContext(client,id),config=sepayConfig();
  if(context.status==='cancelled')throw new SePayError('Hợp đồng đã hủy nên không tạo mã thanh toán.',409);
  const defaultAmount=context.remaining??0;
  const amount=requestedAmount!==undefined?requestedAmount:defaultAmount;
  if(!Number.isSafeInteger(amount)||amount<0||amount>MAX_PAYMENT_AMOUNT||(context.remaining!==null&&context.remaining>0&&amount>context.remaining))throw new SePayError('Số tiền QR vượt phần còn phải thu của hợp đồng.');
  const events=await client.query(`SELECT COALESCE(sum(amount) FILTER(WHERE mode='test' AND status='simulated'),0)::bigint AS demo,COALESCE(max(id),0)::bigint AS version FROM himoto.management_sepay_events WHERE order_id=$1`,[id]);
  const accounts=branchQrAccounts(context.accounts,context.store_id),bank=accountId===undefined?defaultBranchQrAccount(accounts):accounts.find(account=>account.id===accountId);
  if(accountId!==undefined&&!bank)throw new SePayError('Tài khoản nhận không hoạt động hoặc không thuộc cơ sở hợp đồng.',409);
  return {id,code:context.code,configured:Boolean(bank),mode:config.mode,amount,total:context.total_amount,paid:context.paid_amount,
    accounts,bank_id:bank?.id??null,configuration_message:accounts.length?'Chọn tài khoản nhận của cơ sở hợp đồng.':'Cơ sở hợp đồng chưa có tài khoản ngân hàng hợp lệ đang sử dụng. Cập nhật tại Sổ quỹ → Tài khoản thu chi.',
    bank:bank||null,memo:contractTransferMemo(context.code),qr_url:bank?contractVietQr(bank,amount,context.code):null,
    received_demo:Number(events.rows[0].demo),event_version:Number(events.rows[0].version)};
}
/** Caller owns one transaction; provider ID dedupe, receipt and event are committed together. */
export async function processSePayEvent(client:Database,input:SePayPayload,config=sepayConfig()){
  await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='20s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`sepay:${config.mode}:${input.id}`]);
  const previous=(await client.query('SELECT id,fingerprint,status FROM himoto.management_sepay_events WHERE mode=$1 AND external_id=$2',[config.mode,input.id])).rows[0];
  if(previous){if(previous.fingerprint!==input.fingerprint)throw new SePayError('Mã giao dịch đã được dùng cho dữ liệu khác.',409);return {replayed:true,status:previous.status};}
  const registered=await client.query(`SELECT id,store_id,bank_name FROM himoto.banks WHERE lower(status)='active' AND regexp_replace(account_number,'\\s','','g')=$1`,[input.account]);
  if(!bankBin(input.gateway)||!registered.rows.some(row=>bankBin(row.bank_name||'')===bankBin(input.gateway)))throw new SePayError('Tài khoản hoặc ngân hàng nhận chưa được khai báo hoạt động trong HIMOTO.',400);
  const event=(await client.query(`INSERT INTO himoto.management_sepay_events(external_id,mode,fingerprint,transfer_type,amount,account_number,content,reference_code,transaction_at,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'received') RETURNING id`,[input.id,config.mode,input.fingerprint,input.direction,input.amount,input.account,input.content,input.reference,input.at])).rows[0];
  const finish=async(status:string,message:string,order?:{id:number|string;store_id:number|string},transactionId?:number)=>{
    await client.query('UPDATE himoto.management_sepay_events SET status=$2,message=$3,order_id=$4,store_id=$5,transaction_id=$6 WHERE id=$1',[event.id,status,message,order?.id??null,order?.store_id??null,transactionId??null]);
    return {replayed:false,status};
  };
  if(input.direction!=='in')return finish('ignored','Giao dịch tiền ra; không ghi nhận thu hợp đồng.');
  const candidates=await client.query(`SELECT id,store_id,contract_number,created_at,contract_issued_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS issued_at FROM himoto.orders
    WHERE deleted_at IS NULL AND order_status NOT IN ('draft','cancelled') AND NULLIF(contract_number,'') IS NOT NULL
      AND strpos($1,regexp_replace(upper(contract_number),'[^A-Z0-9]','','g'))>0 LIMIT 100`,[compact(input.content)]);
  const matched=candidates.rows.filter(row=>memoMatchesContract(input.content,String(row.contract_number)));
  if(matched.length!==1)return finish('unmatched',matched.length?'Nội dung khớp nhiều hợp đồng; cần đối chiếu.':'Không tìm thấy hợp đồng theo nội dung chuyển khoản.');
  const order=matched[0];
  if(config.mode==='live') {
    // Match the manual payment lock order to avoid a table/row lock inversion.
    await client.query('LOCK TABLE himoto.orders IN ROW EXCLUSIVE MODE');
    await client.query('SELECT id FROM himoto.orders WHERE id=$1 FOR UPDATE',[order.id]);
  }
  let context=await readPaymentContext(client,Number(order.id));
  const matching=branchQrAccounts(context.accounts,context.store_id).filter(bank=>bank.account_number===input.account&&bankBin(bank.bank_code)===bankBin(input.gateway));
  if(matching.length!==1)return finish('review','Tài khoản nhận không thuộc cơ sở hợp đồng hoặc chưa xác định duy nhất tài khoản ghi sổ.',order);
  const bank=matching[0];
  const issued=order.issued_at||order.created_at;
  if(issued&&Date.parse(input.at)+60000<new Date(issued).getTime())return finish('review','Giao dịch có trước thời điểm phát hành hợp đồng.',order);
  if(!PAYABLE_STATUSES.includes(context.status)||context.remaining===null||input.amount>context.remaining)return finish('review','Cần đối chiếu trạng thái hoặc số tiền; chưa tự ghi nhận.',order);
  if(config.mode==='test')return finish('simulated','Đã nhận giao dịch demo; không thay đổi công nợ thật.',order);
  if(!Number.isSafeInteger(config.actorId)||config.actorId<1)throw new SePayError('Chưa cấu hình người ghi sổ SePay.',503);
  await client.query('SELECT id FROM himoto.banks WHERE id=$1 FOR SHARE',[bank.id]);
  context=await readPaymentContext(client,Number(order.id));
  if(!branchQrAccounts(context.accounts,context.store_id).some(current=>current.id===bank.id&&current.account_number===input.account&&bankBin(current.bank_code)===bankBin(input.gateway)&&current.owner_type===bank.owner_type))return finish('review','Tài khoản nhận đã thay đổi; cần đối chiếu trước khi ghi sổ.',order);
  const actor=await client.query("SELECT id FROM himoto.users WHERE id=$1 AND deleted_at IS NULL AND status='active'",[config.actorId]);
  if(!actor.rowCount)throw new SePayError('Tài khoản ghi nhận SePay chưa hoạt động.',503);
  const paidAt=new Date(Date.parse(input.at)+7*3600000).toISOString().slice(0,16);
  const result=await recordContractPayment(client,Number(order.id),config.actorId,{request_id:randomUUID(),revision:context.revision,amount:String(input.amount),method:bank.owner_type==='company'?'company_transfer':'transfer',account_id:bank.id,paid_at:paidAt,note:contractTransferMemo(context.code)});
  return finish('matched','Đã tự động ghi nhận thu tiền hợp đồng.',order,result.transaction_id);
}
