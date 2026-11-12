import 'server-only';
import { createHash,randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { canSettleContract, isOwnershipManager } from '@/lib/management/permissions';
import { MAX_PAYMENT_AMOUNT, type ContractSettlementInput, type ContractSettlementResult } from '@/lib/management/contract-payments';
import { validLifecycleTime } from '@/lib/management/contract-lifecycle';
import { parseInstallmentPlan } from '@/lib/management/contract-billing';
import { badDebtCutoff } from '@/lib/management/contract-bad-debt';
import { dataAccess } from './access-context';
import { ContractPaymentError, parseContractPayment, readPaymentContext, recordContractPayment } from './contract-payments';
import { ContractReturnError,recordBadDebtRecovery } from './contract-returns';

type Database=Pick<PoolClient,'query'>;
export function parseContractSettlement(raw:unknown):ContractSettlementInput {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new ContractPaymentError('Thông tin thanh toán/đóng hợp đồng không hợp lệ.');
  const v=raw as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['request_id','revision','mode','amount','paid_at','note','confirmed','method','account_id','vehicles_confirmed','vehicles'].includes(k))||
    typeof v.request_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.request_id)||
    typeof v.revision!=='string'||!/^\d{1,20}$/.test(v.revision)||!['partial','full','close_unpaid'].includes(String(v.mode))||
    typeof v.amount!=='string'||!/^(0|[1-9]\d{0,12})$/.test(v.amount)||Number(v.amount)>MAX_PAYMENT_AMOUNT||
    typeof v.note!=='string'||v.note.trim().length>1000||!validLifecycleTime(v.paid_at)||Date.parse(v.paid_at+':00+07:00')>Date.now()+300000||v.confirmed!==true)
    throw new ContractPaymentError('Chọn cách thanh toán, số tiền nguyên VNĐ, ngày giờ hợp lệ và xác nhận đã đối chiếu.');
  if(v.mode==='close_unpaid'&&v.amount!=='0'||v.mode==='partial'&&v.amount==='0')throw new ContractPaymentError('Thanh toán một phần cần số tiền lớn hơn 0; đóng không thanh toán phải có số tiền bằng 0.');
  if(v.vehicles!==undefined&&(!Array.isArray(v.vehicles)||v.vehicles.length>50||v.vehicles.some(item=>!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['item_id','revision','status','returned_at'].includes(k))||!Number.isSafeInteger(item.item_id)||item.item_id<=0||typeof item.revision!=='string'||!/^\d{1,20}$/.test(item.revision)||!['with_customer','returned'].includes(item.status)||item.status==='returned'&&!validLifecycleTime(item.returned_at)||item.status==='with_customer'&&item.returned_at!==undefined)||new Set(v.vehicles.map(item=>item.item_id)).size!==v.vehicles.length))throw new ContractPaymentError('Xác nhận trạng thái và ngày trả thực tế của từng xe, không chọn trùng dòng xe.');
  if(v.vehicles_confirmed!==undefined&&v.vehicles_confirmed!==true||v.mode==='partial'&&(v.vehicles!==undefined||v.vehicles_confirmed!==undefined))throw new ContractPaymentError('Chỉ xác nhận trạng thái xe trong thao tác đóng hợp đồng.');
  const input={request_id:v.request_id.toLowerCase(),revision:v.revision,mode:v.mode,amount:v.amount,paid_at:v.paid_at,note:v.note.trim(),confirmed:true,
    ...(v.method!==undefined?{method:v.method}:{}),...(v.account_id!==undefined?{account_id:v.account_id}:{}),
    ...(v.vehicles_confirmed===true?{vehicles_confirmed:true,vehicles:(v.vehicles as NonNullable<ContractSettlementInput['vehicles']>|undefined)?.map(item=>({item_id:item.item_id,revision:item.revision,status:item.status,...(item.returned_at?{returned_at:item.returned_at}:{})})).sort((a,b)=>a.item_id-b.item_id)??[]}:{}),
  } as ContractSettlementInput;
  if(Number(input.amount)>0)parseContractPayment({request_id:input.request_id,revision:input.revision,amount:input.amount,method:input.method,account_id:input.account_id,paid_at:input.paid_at,note:input.note});
  else if(input.method!==undefined||input.account_id!==undefined)throw new ContractPaymentError('Đóng không thu tiền không sử dụng hình thức hoặc tài khoản nhận.');
  return input;
}

/** Caller owns the transaction. Receipt, closure and replay metadata commit together. */
export async function settleContract(db:Database,id:number,actorId:number,raw:unknown):Promise<ContractSettlementResult> {
  const actor=dataAccess.getStore();
  if(!canSettleContract(actor)||actor?.id!==actorId)throw new ContractPaymentError('Chỉ tài khoản được chỉ định và Quản lý Thuê sở hữu được thanh toán/đóng hợp đồng.',403);
  const input=parseContractSettlement(raw);
  if(!Number.isSafeInteger(id)||id<1)throw new ContractPaymentError('Mã hợp đồng không hợp lệ.');
  await db.query("SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='20s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`contract-payment:${input.request_id}`]);
  const order=(await db.query('SELECT store_id,order_status,draft_payload,rent_at,xmin::text AS revision FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0];
  if(!order||isOwnershipManager(actor)&&Number(order.store_id)!==Number(actor.store_id))throw new ContractPaymentError('Không tìm thấy hợp đồng trong phạm vi tài khoản.',404);
  const hash=createHash('sha256').update(JSON.stringify({id,actorId,...input})).digest('hex');
  const previous=order.draft_payload?.management_composer?.payment_actions?.find((v:{request_id?:string})=>v?.request_id===input.request_id);
  if(previous){
    if(previous.request_hash!==hash)throw new ContractPaymentError('Mã thao tác đã được dùng cho nội dung hoặc người thực hiện khác.',409);
    return {context:await readPaymentContext(db,id),transaction_id:previous.transaction_id??null,replayed:true};
  }
  if(order.revision!==input.revision)throw new ContractPaymentError('Hợp đồng hoặc công nợ đã thay đổi. Tải lại trước khi xác nhận.',409);
  const alreadyClosed=order.order_status==='completed'&&Boolean(order.draft_payload?.management_composer?.lifecycle?.payment_closure||order.draft_payload?.management_composer?.lifecycle?.bad_debt_closure);
  if(!['renting','overdue','wait_payment','bad_debt'].includes(order.order_status)&&!alreadyClosed||alreadyClosed&&input.mode==='close_unpaid')throw new ContractPaymentError('Chỉ thanh toán/đóng hợp đồng đã phát hành và đang theo dõi.',409);
  const before=await readPaymentContext(db,id),remaining=before.settlement_remaining;
  if(before.hold_active||before.completed_from_hold||remaining==null||before.paid_amount===null||before.settlement_total==null)throw new ContractPaymentError('Cần đối chiếu trạng thái và số tiền trước khi thanh toán/đóng hợp đồng.',409);
  const amount=Number(input.amount),closing=input.mode!=='partial'&&!alreadyClosed;
  if(input.mode==='partial'&&!(amount>0&&amount<remaining))throw new ContractPaymentError('Thanh toán một phần phải lớn hơn 0 và nhỏ hơn công nợ còn lại.',409);
  if(input.mode==='full'&&amount!==remaining)throw new ContractPaymentError('Thanh toán toàn bộ phải bằng đúng công nợ còn lại theo hợp đồng.',409);
  if(closing){
    if(input.vehicles_confirmed!==true||!input.vehicles||input.vehicles.length!==before.items.length||before.items.some(item=>!input.vehicles!.some(choice=>choice.item_id===item.id&&choice.revision===item.revision)))throw new ContractPaymentError('Xác nhận đủ trạng thái từng xe theo phiên bản hiện tại trước khi đóng hợp đồng.',409);
  }else if(input.vehicles!==undefined||input.vehicles_confirmed!==undefined)throw new ContractPaymentError('Không thay trạng thái xe khi chỉ thu công nợ.',409);
  const when=Date.parse(input.paid_at+':00+07:00');
  const debtCutoff=badDebtCutoff(order.draft_payload);
  if(closing&&debtCutoff&&when<Date.parse(debtCutoff))throw new ContractPaymentError('Ngày đóng không được trước ngày chuyển nợ xấu.',409);
  const returned=(await db.query('SELECT completed_at FROM himoto.order_vehicle_details WHERE order_id=$1 AND deleted_at IS NULL AND completed_at IS NOT NULL',[id])).rows;
  if(order.rent_at&&when<Date.parse(order.rent_at)||closing&&returned.some(row=>when<Date.parse(row.completed_at)))throw new ContractPaymentError('Ngày thanh toán/đóng không được trước ngày nhận xe hoặc ngày trả/thu hồi xe.',409);
  if(input.vehicles?.some(item=>item.status==='returned'&&Date.parse(item.returned_at!+':00+07:00')>when))throw new ContractPaymentError('Ngày trả/thu hồi xe không được sau ngày đóng hợp đồng.',409);
  let transactionId:number|null=null;
  if(amount>0){
    const result=await recordContractPayment(db,id,actorId,{request_id:input.request_id,revision:input.revision,amount:input.amount,method:input.method!,account_id:input.account_id!,paid_at:input.paid_at,note:input.note},undefined,{contractSettlement:true});
    transactionId=result.transaction_id;
  }
  const row=(await db.query('SELECT draft_payload FROM himoto.orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
  const payload=structuredClone(row.draft_payload||{}),composer=payload.management_composer??={},recordedAt=new Date().toISOString();
  payload.management_composer=composer;
  if(closing){
    const plan=composer.installment_plan?parseInstallmentPlan(composer.installment_plan):null;
    // A closed agreement never starts accruing again. Full contractual payment
    // covers the original schedule; closing without receipt preserves accrued debt.
    if(plan&&!plan.stopped_at)composer.installment_plan={...plan,stopped_at:input.mode==='full'?plan.end:input.paid_at<plan.start?plan.start:input.paid_at>plan.end?plan.end:input.paid_at};
    const lifecycle=composer.lifecycle??={};composer.lifecycle=lifecycle;
    const closureTotal=input.mode==='full'?before.settlement_total:before.total_amount;
    lifecycle.payment_closure={at:input.paid_at+':00+07:00',recorded_at:recordedAt,actor_id:actorId,mode:input.mode,note:input.note,request_id:input.request_id,total:closureTotal,paid:before.paid_amount+amount,remaining:closureTotal===null?null:Math.max(closureTotal-before.paid_amount-amount,0),transaction_id:transactionId,vehicles:input.vehicles};
    lifecycle.events=[...(Array.isArray(lifecycle.events)?lifecycle.events:[]),{action:'payment_closed',at:input.paid_at+':00+07:00',recorded_at:recordedAt,actor_id:actorId,actor_name:`#${actorId}`,note:input.note,from:order.order_status,to:'completed'}];
  }
  composer.payment_actions=[...(Array.isArray(composer.payment_actions)?composer.payment_actions:[]),{request_id:input.request_id,request_hash:hash,actor_id:actorId,mode:input.mode,at:recordedAt,amount,transaction_id:transactionId}];
  await db.query('UPDATE himoto.orders SET order_status=CASE WHEN $3 THEN \'completed\' ELSE order_status END,draft_payload=$2::json,updated_at=now() WHERE id=$1',[id,JSON.stringify(payload),closing]);
  if(closing)for(const vehicle of input.vehicles??[])if(vehicle.status==='returned'){
    try{await recordBadDebtRecovery(db,actorId,{request_id:randomUUID(),item_id:vehicle.item_id,item_revision:vehicle.revision,recovered_at:vehicle.returned_at!,note:input.note||'Xác nhận xe đã trả/thu hồi khi đóng hợp đồng.'});}
    catch(error){if(error instanceof ContractReturnError)throw new ContractPaymentError(error.message,error.status);throw error;}
  }
  return {context:await readPaymentContext(db,id),transaction_id:transactionId,replayed:false};
}
