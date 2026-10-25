import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { ReturnCorrectionContext, ReturnCorrectionInput } from '@/lib/management/return-corrections';
import type { ReturnResult, ReturnSettlement } from '@/lib/management/contract-returns';
import { hasPermission, isAdminAccount } from '@/lib/management/permissions';
import { parseInstallmentPlan } from '@/lib/management/contract-billing';
import { dataAccess, usesScopedDatabase } from './access-context';
import { VEHICLE_ORDER_SQL } from './contract-classification';
import { ContractReturnError, loadContractReturnableItems, parseReturnInput } from './contract-returns';
import { readPaymentContext } from './contract-payments';
import { parseReturnSettlements, settleReturnedItems } from './return-settlements';

type Database=Pick<PoolClient,'query'>;
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const local=(value:unknown)=>new Date(new Date(String(value)).getTime()+7*3600000).toISOString().slice(0,16);
const idsOf=(value:unknown):number[]=>Array.isArray(value)?value.map(Number).filter(id=>Number.isSafeInteger(id)&&id>0).sort((a,b)=>a-b):[];
const sameIds=(a:number[],b:number[])=>a.length===b.length&&a.every((id,i)=>id===b[i]);
const MAX_MONEY=9_999_999_999_999;
function noticeItems(notice:{photo_phases?:string[];photo_slots?:string[];event_key:string;root_event_key?:string}) {
  const phases=Array.isArray(notice.photo_phases)?notice.photo_phases:[];
  const slots=Array.isArray(notice.photo_slots)?notice.photo_slots:[];
  const references=phases.length?phases.map(p=>p.match(/^return-([1-9]\d*)$/)?.[1]):slots.length?slots.map(p=>p.match(/^return-([1-9]\d*)-/)?.[1]):(notice.root_event_key||notice.event_key).split(':').at(-1)!.split(/[,-]/);
  return [...new Set(idsOf(references))];
}

async function readState(db:Database,itemId:number,lock=false) {
  if(!Number.isSafeInteger(itemId)||itemId<=0)throw new ContractReturnError('Chọn đúng xe đã trả.');
  const order=(await db.query(`SELECT o.id,o.store_id,o.draft_payload,o.order_status,o.total,o.pid,o.xmin::text AS revision
    FROM himoto.orders o JOIN himoto.order_vehicle_details d ON d.order_id=o.id
    WHERE d.id=$1 AND d.deleted_at IS NULL AND d.completed_at IS NOT NULL AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
    AND o.order_status IN('renting','overdue','wait_payment','completed') ${lock?'FOR UPDATE OF o':''}`,[itemId])).rows[0];
  if(!order)throw new ContractReturnError('Không tìm thấy lượt trả xe trong cơ sở được phép sửa.',404);
  const actor=dataAccess.getStore();
  if(actor&&(!hasPermission(actor,'contracts.return')||!isAdminAccount(actor)&&!actor.scope_all&&Number(actor.store_id)!==Number(order.store_id)))throw new ContractReturnError('Chỉ được sửa lượt trả xe thuộc phạm vi cơ sở đã được cấp.',403);
  const composer=order.draft_payload?.management_composer||{};
  const notices=(await db.query(`SELECT event_key,root_event_key,photo_phases,photo_slots,status,message_ids,retraction,content_hash
    FROM himoto.management_contract_notifications WHERE order_id=$1 AND event_type='return' ORDER BY created_at,id`,[order.id])).rows;
  const notice=notices.find(n=>noticeItems(n).includes(itemId));
  const settlement=Array.isArray(composer.return_settlements)?composer.return_settlements.findLast((s:{item_ids:number[]})=>idsOf(s.item_ids).includes(itemId)):undefined;
  const itemIds=notice?noticeItems(notice):settlement?idsOf(settlement.item_ids):[itemId];
  if(!itemIds.length||itemIds.length>20||settlement&&!sameIds(itemIds,idsOf(settlement.item_ids)))throw new ContractReturnError('Nhóm xe trả chưa khớp hồ sơ gốc. Cần đối chiếu trước khi sửa.',409);
  const lines=(await loadContractReturnableItems(db,Number(order.id))).filter(line=>itemIds.includes(line.item_id));
  if(lines.length!==itemIds.length||lines.some(line=>!line.completed_at||line.return_reconciled))throw new ContractReturnError('Chưa đủ hồ sơ ngày trả thực tế để sửa lượt này.',409);
  if(lock)await db.query('SELECT id FROM himoto.order_vehicle_details WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[itemIds]);
  const relevant=notices.filter(n=>{const references=noticeItems(n);return !references.length||references.some(id=>itemIds.includes(id));});
  const blocked=relevant.some(n=>n.retraction?.state!=='done'&&(n.retraction||['pending','sending','unknown'].includes(n.status)||n.status==='failed'&&n.message_ids?.length));
  const linked=settlement?idsOf([...(settlement.transaction_ids||[]),settlement.refund_transaction_id,settlement.rental_refund_transaction_id]):[];
  const transactions=linked.length?(await db.query(`SELECT id,name,type,value,cash_id,bank_id,bank_owner_type,created_at,status,xmin::text AS revision
    FROM himoto.transactions WHERE order_id=$1 AND id=ANY($2::bigint[]) ORDER BY id ${lock?'FOR UPDATE':''}`,[order.id,linked])).rows:[];
  if(transactions.length!==linked.length||transactions.some(t=>t.status!=='approved'||!['order:return_late','order:return_repair','order:payment','order:deposit_refund','order:rental_refund'].includes(t.name)))throw new ContractReturnError('Phiếu thu/hoàn của lượt trả đã thay đổi. Cần đối chiếu lịch sử trước khi sửa.',409);
  const payment=await readPaymentContext(db,Number(order.id));
  const existing=Array.isArray(composer.return_adjustments)?composer.return_adjustments.filter((a:{item_id:number})=>itemIds.includes(Number(a.item_id))):[];
  if(new Set(existing.map((a:{item_id:number})=>Number(a.item_id))).size!==existing.length)throw new ContractReturnError('Hồ sơ có nhiều điều chỉnh trùng xe. Cần đối chiếu trước khi sửa.',409);
  const previousAdjustment=existing.reduce((sum:number,a:{fee:number})=>sum+Number(a.fee||0),0);
  const signed=transactions.reduce((sum,t)=>sum+(t.type==='out'?-1:1)*(t.name==='order:deposit_refund'?0:Number(t.value)),0);
  const refunded=transactions.filter(t=>t.name==='order:deposit_refund').reduce((sum,t)=>sum+Number(t.value),0);
  const receipt=(t:typeof transactions[number])=>({request_id:'',amount:String(t.value),method:t.cash_id!=null?'cash' as const:t.bank_owner_type==='company'?'company_transfer' as const:'transfer' as const,account_id:Number(t.cash_id??t.bank_id),paid_at:local(t.created_at)});
  const recipient=settlement?.recipient||{};
  const refund=transactions.find(t=>t.name==='order:deposit_refund'),rentalRefund=transactions.find(t=>t.name==='order:rental_refund');
  const currentSettlement:ReturnSettlement={order_id:Number(order.id),revision:order.revision,receipts:transactions.filter(t=>t.type!=='out').map(t=>({...receipt(t),kind:t.name==='order:return_late'?'late_fee':t.name==='order:return_repair'?'repair_fee':'rental_debt'})),
    ...(refund?{refund:{...receipt(refund),recipient_bank:recipient.bank||'',recipient_account:recipient.account||'',recipient_name:recipient.name||''}}:{}),
    ...(rentalRefund?{rental_refund:{...receipt(rentalRefund),recipient_bank:settlement?.rental_refund_recipient?.bank||'',recipient_account:settlement?.rental_refund_recipient?.account||'',recipient_name:settlement?.rental_refund_recipient?.name||''}}:{}),
    ...(!refund&&settlement?.refund_deferred?{refund_deferred:true as const,refund_recipient:recipient}:{})};
  const revision=hash({order:order.revision,lines:lines.map(l=>[l.item_id,l.item_revision]),transactions:transactions.map(t=>[t.id,t.revision]),itemIds});
  const context:ReturnCorrectionContext={order_id:Number(order.id),code:payment.code,customer:lines[0].customer_name,revision,event_key:notice?.root_event_key||notice?.event_key||`return:${order.id}:${itemIds.join(',')}`,
    lines:lines.map(line=>{const a=existing.find((a:{item_id:number})=>Number(a.item_id)===line.item_id);return {...line,late_fee:Number(a?.late_fee??Math.max(Number(a?.fee||0)+Number(a?.early_discount||0)-Number(a?.repair_fee||0),0)),repair_fee:Number(a?.repair_fee||0),repair_note:String(a?.repair_note||''),early_discount:Number(a?.early_discount||0),hourly_rate:Number(a?.hourly_rate??20000)};}),
    payment:{...payment,paid_amount:payment.paid_amount===null?null:payment.paid_amount-signed,deposit_held:payment.deposit_held+refunded,deposit_refunded:payment.deposit_refunded-refunded},
    settlement:currentSettlement,previous_adjustment:previousAdjustment,note:String(settlement?.note||''),blocked_reason:blocked?'Lượt này đang gửi, gửi dở hoặc thu hồi Telegram. Đối chiếu và hoàn tất trước khi sửa.':''};
  return {order,composer,context,itemIds,transactions,existing,signed,settlement};
}

export async function readReturnCorrection(db:Database,itemId:number) {return (await readState(db,itemId)).context;}

export function parseReturnCorrection(raw:unknown):ReturnCorrectionInput {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new ContractReturnError('Thông tin sửa trả xe chưa hợp lệ.');
  const body=raw as Record<string,unknown>;
  if(Object.keys(body).some(k=>!['item_id','revision','request_id','reason','note','items','settlement'].includes(k))||!Number.isSafeInteger(body.item_id)||Number(body.item_id)<=0||typeof body.revision!=='string'||!/^[a-f0-9]{64}$/.test(body.revision)||typeof body.request_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id)||typeof body.reason!=='string'||body.reason.trim().length<5||body.reason.trim().length>1000||typeof body.note!=='string'||body.note.trim().length>1000||!Array.isArray(body.items)||!body.items.length||body.items.length>20)throw new ContractReturnError('Chọn lượt trả và ghi lý do sửa từ 5 đến 1.000 ký tự.');
  const items=body.items.map(parseReturnInput);
  if(new Set(items.map(i=>i.item_id)).size!==items.length)throw new ContractReturnError('Mỗi xe chỉ xuất hiện một lần.');
  return {item_id:Number(body.item_id),revision:body.revision,request_id:body.request_id.toLowerCase(),reason:body.reason.trim(),note:body.note.trim(),items,settlement:parseReturnSettlements([body.settlement])[0]};
}

/** Atomic correction: retain returned inventory, supersede only this event's vouchers, preserve the audit. */
export async function correctReturn(db:Database,actor:number,raw:unknown) {
  const input=parseReturnCorrection(raw);
  await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='30s'");
  const state=await readState(db,input.item_id,true),{context,order,composer,itemIds}=state;
  const requestHash=hash({actor,input});
  const edits=Array.isArray(composer.return_corrections)?composer.return_corrections:[];
  const previous=edits.find((e:{request_id:string})=>e.request_id===input.request_id);
  if(previous){if(previous.request_hash!==requestHash)throw new ContractReturnError('Mã lần sửa đã dùng cho nội dung khác.',409);return context;}
  if(context.blocked_reason)throw new ContractReturnError(context.blocked_reason,409);
  if(context.revision!==input.revision||input.settlement.revision!==order.revision)throw new ContractReturnError('Hồ sơ hoặc tiền đã thay đổi. Mở lại lượt trả để đối chiếu trước khi lưu.',409);
  if(input.settlement.order_id!==Number(order.id)||!sameIds(idsOf(input.items.map(i=>i.item_id)),itemIds))throw new ContractReturnError('Chỉ sửa đúng các xe và khoản tiền trong lượt trả đã chọn.',403);
  const receiptKeys=[...input.settlement.receipts,...[input.settlement.refund,input.settlement.rental_refund].filter(r=>r!==undefined)].map(r=>r.request_id);
  if(receiptKeys.length&&(await db.query('SELECT request_id FROM himoto.management_contract_payments WHERE request_id=ANY($1::uuid[])',[receiptKeys])).rowCount)throw new ContractReturnError('Mã phiếu thu/hoàn đã được dùng. Mở lại lượt sửa để đối chiếu.',409);
  const planValue=composer.installment_plan,plan=planValue?parseInstallmentPlan(planValue):null;
  if(planValue&&!plan)throw new ContractReturnError('Lịch đóng tiền chưa hợp lệ. Cần đối chiếu trước khi sửa.',409);
  const results:ReturnResult[]=[];
  const adjustments=[];
  for(const item of input.items){
    const line=context.lines.find(l=>l.item_id===item.item_id)!;
    if(line.item_revision!==item.item_revision)throw new ContractReturnError('Dòng xe đã thay đổi. Mở lại trước khi sửa.',409);
    const actual=`${item.returned_at}:00+07:00`,when=Date.parse(actual),scheduled=Date.parse(line.scheduled_return_at||'');
    if(!Number.isFinite(scheduled)||line.scheduled_start_at&&when<Date.parse(line.scheduled_start_at)||plan&&item.returned_at<plan.start)throw new ContractReturnError('Giờ trả phải sau giờ nhận xe và có hạn trả hợp lệ.');
    const early=Number(item.early_discount||0),late=Number(item.fee_override||0),repair=Number(item.repair_fee||0),fee=late+repair-early;
    if(late&&when<=scheduled||early&&when>=scheduled||plan&&early)throw new ContractReturnError('Phí trễ / giảm trả sớm chưa khớp thời điểm trả hoặc lịch thuê sở hữu.');
    if(item.fee_override===undefined)throw new ContractReturnError('Nhập phí quá hạn thực tế, kể cả 0đ.');
    if(!usesScopedDatabase())await db.query('SELECT id FROM himoto.vehicles WHERE id=$1 FOR UPDATE',[line.vehicle_id]);
    const next=(await db.query(`SELECT min(d.rent_at) AS next_start FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
      WHERE d.vehicle_id=$1 AND d.id<>$2 AND d.deleted_at IS NULL AND o.deleted_at IS NULL AND o.order_status NOT IN('draft','cancelled')
      AND d.rent_at >= $3::timestamptz`,[line.vehicle_id,line.item_id,line.completed_at])).rows[0]?.next_start;
    if(when>Date.parse(line.completed_at!)&&next&&when>new Date(next).getTime())throw new ContractReturnError(`Giờ trả xe ${line.license} trùng thời gian xe đã giao cho hợp đồng sau.`,409);
    if(usesScopedDatabase())try{await db.query('SELECT himoto.correct_returned_contract_time($1,$2::timestamptz)',[item.item_id,actual]);}catch(error){if((error as {code?:string}).code==='22023')throw new ContractReturnError(`Giờ trả xe ${line.license} trùng thời gian xe đã giao cho hợp đồng sau.`,409);throw error;}
    else await db.query('UPDATE himoto.order_vehicle_details SET completed_at=$2::timestamptz,updated_at=now() WHERE id=$1',[item.item_id,actual]);
    const minutes=Math.max(Math.ceil((when-scheduled)/60000),0);
    adjustments.push({item_id:item.item_id,vehicle_id:line.vehicle_id,scheduled_return_at:line.scheduled_return_at,actual_return_at:actual,late_minutes:minutes,chargeable_hours:Math.ceil(minutes/60),hourly_rate:Number(item.hourly_rate),fee,late_fee:late,repair_fee:repair,repair_note:item.repair_note||'',early_discount:early,fee_overridden:true,actor_id:actor});
    results.push({item_id:item.item_id,contract_code:context.code,returned_at:actual,scheduled_return_at:line.scheduled_return_at!,late_minutes:minutes,chargeable_hours:Math.ceil(minutes/60),hourly_rate:Number(item.hourly_rate),fee,late_fee:late,repair_fee:repair,total_amount:null,status:order.order_status});
  }
  const newFee=adjustments.reduce((sum,a)=>sum+a.fee,0),nextTotal=Number(order.total)+newFee-context.previous_adjustment;
  if(order.total==null||order.total===''||!Number.isSafeInteger(nextTotal)||nextTotal<0||nextTotal>MAX_MONEY)throw new ContractReturnError('Tổng tiền sau điều chỉnh chưa hợp lệ hoặc vượt giới hạn.',409);
  const payload=structuredClone(order.draft_payload||{}),nextComposer=payload.management_composer||{};
  nextComposer.return_adjustments=[...(Array.isArray(composer.return_adjustments)?composer.return_adjustments:[]).filter((a:{item_id:number})=>!itemIds.includes(Number(a.item_id))),...adjustments];
  if(plan){
    const status=(await db.query('SELECT count(*) FILTER(WHERE completed_at IS NULL)::int AS remaining,max(completed_at) AS latest FROM himoto.order_vehicle_details WHERE order_id=$1 AND deleted_at IS NULL',[order.id])).rows[0];
    if(!Number(status.remaining))nextComposer.installment_plan={...plan,stopped_at:local(status.latest)<plan.end?local(status.latest):plan.end};
  }
  const cancelled=state.transactions.map(t=>Number(t.id));
  if(cancelled.length)await db.query("UPDATE himoto.transactions SET status='cancelled',updated_at=now() WHERE order_id=$1 AND id=ANY($2::bigint[])",[order.id,cancelled]);
  const nextPid=Number(order.pid)-state.signed;
  if(order.pid==null||!Number.isSafeInteger(nextPid)||nextPid<0)throw new ContractReturnError('Tổng tiền đã thu chưa hợp lệ để sửa phiếu.',409);
  payload.management_composer=nextComposer;
  await db.query('UPDATE himoto.orders SET total=$2,pid=$3,draft_payload=$4::json,updated_at=now() WHERE id=$1',[order.id,String(nextTotal),nextPid,JSON.stringify(payload)]);
  const payment=await readPaymentContext(db,Number(order.id));
  await settleReturnedItems(db,actor,{...input.settlement,revision:payment.revision},itemIds,results);
  const saved=(await db.query('SELECT draft_payload FROM himoto.orders WHERE id=$1',[order.id])).rows[0].draft_payload;
  const after=await readPaymentContext(db,Number(order.id));
  const snapshot=saved.management_composer.return_settlements.at(-1);snapshot.note=input.note;
  saved.management_composer.return_corrections=[...edits,{request_id:input.request_id,request_hash:requestHash,at:new Date().toISOString(),actor_id:actor,reason:input.reason,item_ids:itemIds,cancelled_transaction_ids:cancelled,
    before:{adjustments:state.existing,settlement:state.settlement||null,transactions:state.transactions,total:order.total,pid:order.pid,status:order.order_status},after:{adjustments,settlement:snapshot,total:after.total_amount,paid:after.paid_amount,status:after.status}}];
  await db.query('UPDATE himoto.orders SET draft_payload=$2::json,updated_at=now() WHERE id=$1',[order.id,JSON.stringify(saved)]);
  return readReturnCorrection(db,input.item_id);
}
