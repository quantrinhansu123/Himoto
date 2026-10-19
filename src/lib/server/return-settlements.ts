import 'server-only';
import type { PoolClient } from 'pg';
import type { ReturnInput,ReturnReceipt,ReturnResult,ReturnSettlement } from '@/lib/management/contract-returns';
import { returnRefundQrSlot } from '@/lib/management/contract-photos';
import { ContractReturnError,recordVehicleReturn } from './contract-returns';
import { parseContractPayment,readPaymentContext,recordContractPayment } from './contract-payments';
type Database=Pick<PoolClient,'query'>;
export function parseReturnSettlements(value:unknown):ReturnSettlement[] {
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>20)throw new ContractReturnError('Thông tin thu phí / hoàn cọc chưa hợp lệ.');
  const result=value.map(raw=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new ContractReturnError('Thông tin quyết toán trả xe chưa hợp lệ.');
    const row=raw as Record<string,unknown>;
    if(Object.keys(row).some(key=>!['order_id','revision','receipts','refund'].includes(key))||!Number.isSafeInteger(row.order_id)||Number(row.order_id)<=0||typeof row.revision!=='string'||!/^\d{1,20}$/.test(row.revision)||!Array.isArray(row.receipts)||row.receipts.length>20)throw new ContractReturnError('Chọn đúng hợp đồng, phiên bản và các khoản đã thu.');
    const parse=(input:unknown,refund=false)=>{
      if(!input||typeof input!=='object'||Array.isArray(input))throw new ContractReturnError('Khoản thu / hoàn chưa hợp lệ.');
      const receipt=input as Record<string,unknown>;
      const extra=refund?['recipient_bank','recipient_account','recipient_name']:['kind'];
      if(Object.keys(receipt).some(key=>!['request_id','amount','method','account_id','paid_at',...extra].includes(key)))throw new ContractReturnError('Khoản thu / hoàn có trường không hỗ trợ.');
      const parsed=parseContractPayment({request_id:receipt.request_id,revision:row.revision,amount:receipt.amount,method:receipt.method,account_id:receipt.account_id,paid_at:receipt.paid_at,note:''});
      return {request_id:parsed.request_id,amount:parsed.amount,method:parsed.method,account_id:parsed.account_id,paid_at:parsed.paid_at};
    };
    const receipts=row.receipts.map(receipt=>{
      const parsed=parse(receipt);const kind=(receipt as {kind:ReturnReceipt['kind']}).kind;
      if(!['late_fee','repair_fee','rental_debt'].includes(kind))throw new ContractReturnError('Chọn loại thu quá hạn, sửa chữa hoặc công nợ.');
      return {...parsed,kind};
    });
    let refund:ReturnSettlement['refund'];
    if(row.refund!==undefined){
      const parsed=parse(row.refund,true),raw=row.refund as Record<string,unknown>;
      const text=(key:string)=>{const value=raw[key];if(value!==undefined&&(typeof value!=='string'||value.length>150))throw new ContractReturnError('Thông tin nhận hoàn cọc chưa hợp lệ.');return String(value||'').trim();};
      const recipient_bank=text('recipient_bank'),recipient_account=text('recipient_account').replace(/\s/g,''),recipient_name=text('recipient_name');
      // Typed recipient fields may be omitted when a return QR photo exists; completeReturnBatch verifies the photo.
      if(parsed.method!=='cash'&&recipient_account&&!/^[A-Z0-9-]{3,34}$/i.test(recipient_account))throw new ContractReturnError('Số tài khoản khách nhận hoàn cọc chưa hợp lệ.');
      if(parsed.method!=='cash'&&!recipient_bank&&!recipient_name&&!recipient_account){/* QR-only path */}
      else if(parsed.method!=='cash'&&(!recipient_bank||!recipient_name)&&!recipient_account)throw new ContractReturnError('Nhập ngân hàng và chủ tài khoản, hoặc để trống cả ba ô khi đã lưu ảnh QR.');
      refund={...parsed,...(parsed.method!=='cash'?{...(recipient_bank?{recipient_bank}:{}),...(recipient_name?{recipient_name}:{}),...(recipient_account?{recipient_account}:{})}:{})};
    }
    const ids=[...receipts.map(receipt=>receipt.request_id),...(refund?[refund.request_id]:[])];
    if(new Set(ids).size!==ids.length)throw new ContractReturnError('Mỗi khoản thu / hoàn cần một mã giao dịch riêng.');
    return {order_id:Number(row.order_id),revision:row.revision,receipts,...(refund?{refund}:{})};
  });
  if(new Set(result.map(row=>row.order_id)).size!==result.length)throw new ContractReturnError('Mỗi hợp đồng chỉ quyết toán một lần trong lượt trả.');
  return result;
}

// Entire operation, including receipts/refund, is committed by the route once.
// Branch staff use only contracts.return; no generic finance permission is added.
export async function completeReturnBatch(db:Database,actor:number,inputs:ReturnInput[],settlements:ReturnSettlement[]) {
  const items=(await db.query('SELECT id,order_id FROM himoto.order_vehicle_details WHERE id=ANY($1::bigint[]) AND deleted_at IS NULL AND completed_at IS NULL',[inputs.map(input=>input.item_id)])).rows;
  if(items.length!==inputs.length)throw new ContractReturnError('Xe đã được trả, đã thay đổi hoặc không thuộc cơ sở. Tải lại để kiểm tra.',409);
  const orders=[...new Set(items.map(item=>Number(item.order_id)))].sort((a,b)=>a-b);
  const locked=(await db.query('SELECT id,xmin::text AS revision FROM himoto.orders WHERE id=ANY($1::bigint[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE',[orders])).rows;
  if(locked.length!==orders.length)throw new ContractReturnError('Không tìm thấy hợp đồng trong cơ sở.',404);
  for(const settlement of settlements){
    const order=locked.find(order=>Number(order.id)===settlement.order_id);
    if(!order)throw new ContractReturnError('Chỉ thu / hoàn cho hợp đồng có xe trong lượt trả này.',403);
    if(order.revision!==settlement.revision)throw new ContractReturnError('Tiền hợp đồng đã thay đổi. Tải lại trước khi thu phí / hoàn cọc.',409);
  }
  const results:ReturnResult[]=[];
  const sorted=[...inputs].sort((a,b)=>Number(items.find(item=>Number(item.id)===a.item_id)?.order_id)-Number(items.find(item=>Number(item.id)===b.item_id)?.order_id)||a.item_id-b.item_id);
  for(const input of sorted)results.push(await recordVehicleReturn(db,actor,input));
  for(const settlement of settlements){
    const selected=items.filter(item=>Number(item.order_id)===settlement.order_id).map(item=>Number(item.id));
    const returns=results.filter(result=>selected.includes(result.item_id));
    const late=returns.reduce((sum,result)=>sum+(result.late_fee||0),0),repair=returns.reduce((sum,result)=>sum+(result.repair_fee||0),0);
    let context=await readPaymentContext(db,settlement.order_id);
    const debt=Math.max((context.remaining||0)-late-repair,0),limits={late_fee:late,repair_fee:repair,rental_debt:debt};
    for(const kind of ['late_fee','repair_fee','rental_debt'] as const)if(settlement.receipts.filter(receipt=>receipt.kind===kind).reduce((sum,receipt)=>sum+Number(receipt.amount),0)>limits[kind])throw new ContractReturnError('Khoản thu vượt phí quá hạn, sửa chữa hoặc công nợ cần thu.',409);
    const transactionIds:number[]=[];
    for(const receipt of settlement.receipts){
      const label={late_fee:'Thu phí quá hạn',repair_fee:'Thu phí sửa chữa',rental_debt:'Thu công nợ thuê xe'}[receipt.kind];
      const {kind,...payment}=receipt;
      const paid=await recordContractPayment(db,settlement.order_id,actor,{...payment,revision:context.revision,note:`${label}_${context.code}`});
      context=paid.context;transactionIds.push(paid.transaction_id);
      await db.query('UPDATE himoto.transactions SET name=$2 WHERE id=$1',[paid.transaction_id,kind==='late_fee'?'order:return_late':kind==='repair_fee'?'order:return_repair':'order:payment']);
    }
    let refundId:number|null=null;
    if(settlement.refund){
      if(context.items.length)throw new ContractReturnError('Chỉ hoàn cọc trong lượt trả sau khi đã nhận đủ xe của hợp đồng.',409);
      if(context.remaining===null||context.remaining>0)throw new ContractReturnError('Cần thu đủ phí quá hạn, sửa chữa và công nợ trước khi hoàn cọc.',409);
      const refund=settlement.refund;
      if(refund.method!=='cash'&&(!refund.recipient_bank||!refund.recipient_name||!refund.recipient_account)){
        const qrSlots=selected.map(returnRefundQrSlot);
        const hasQr=(await db.query(`SELECT 1 FROM himoto.management_record_photos
          WHERE entity_type='contracts' AND entity_id=$1 AND slot=ANY($2::text[]) LIMIT 1`,[settlement.order_id,qrSlots])).rowCount;
        if(!hasQr)throw new ContractReturnError('Thiếu thông tin nhận hoàn cọc và chưa có ảnh QR / Số tài khoản khách nhận hoàn. Nhập đủ hoặc lưu ảnh QR rồi thử lại.',409);
        if(refund.recipient_bank||refund.recipient_name||refund.recipient_account){
          if(!refund.recipient_bank||!refund.recipient_name)throw new ContractReturnError('Khi nhập tay thông tin nhận hoàn, cần đủ ngân hàng và tên chủ TK (số TK có thể thay bằng ảnh QR).',409);
        }
      }
      const paid=await recordContractPayment(db,settlement.order_id,actor,{request_id:refund.request_id,revision:context.revision,amount:refund.amount,method:refund.method,account_id:refund.account_id,paid_at:refund.paid_at,purpose:'deposit_refund',note:`Hoàn cọc khi trả xe_${context.code}${refund.recipient_bank||refund.recipient_account||refund.recipient_name?` · ${[refund.recipient_bank,refund.recipient_account||'QR',refund.recipient_name].filter(Boolean).join(' · ')}`:' · theo ảnh QR'}`});
      context=paid.context;refundId=paid.transaction_id;
    }
    const snapshot={item_ids:selected,transaction_ids:transactionIds,refund_transaction_id:refundId,...(settlement.refund?{recipient:{bank:settlement.refund.recipient_bank,account:settlement.refund.recipient_account,name:settlement.refund.recipient_name}}:{}),at:new Date().toISOString(),actor_id:actor};
    await db.query(`UPDATE himoto.orders SET draft_payload=jsonb_set(COALESCE(draft_payload::jsonb,'{}'::jsonb),'{management_composer}',
      COALESCE(draft_payload::jsonb->'management_composer','{}'::jsonb)||jsonb_build_object('return_settlements',COALESCE(draft_payload::jsonb #> '{management_composer,return_settlements}','[]'::jsonb)||$2::jsonb),true)::json,
      order_status=CASE WHEN $3 THEN order_status WHEN $4 THEN 'completed' ELSE 'wait_payment' END,updated_at=now() WHERE id=$1`,[settlement.order_id,JSON.stringify([snapshot]),context.items.length>0,context.remaining===0]);
    for(const result of returns)if(!context.items.length)result.status=context.remaining===0?'completed':'wait_payment';
  }
  return inputs.map(input=>results.find(result=>result.item_id===input.item_id)!);
}
