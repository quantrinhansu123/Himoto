import 'server-only';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {NextRequest} from 'next/server';
import type {SessionUser} from './management-session';
import {findPaymentAccount} from '@/lib/management/contract-payments';
import {normalizeRefundAccount,validRefundAccount} from '@/lib/management/return-refunds';
import {paymentImpact} from '../../../shared/mobile-finance';
import {isMobileReturnSettlementPreview,type MobileReturnMoney,type MobileReturnRefund,type MobileReturnSettlement,type MobileReturnSettlementInput,type MobileReturnSettlementPreview} from '../../../shared/mobile-return-settlement';
import {ContractPaymentError,parseContractPayment,readPaymentContext} from './contract-payments';
import {ContractReturnError,parseReturnBatch} from './contract-returns';
import {readReturnFeePreview} from './mobile-return-preview';
import {requireMobileReturn} from './mobile-returns';
import {mobileFinanceId} from './mobile-finance';
import {mobileBody} from './mobile-writes';
import {withMobileData} from './mobile-context';
import {himotoPool} from './himoto-database';
import {MobileError} from './mobile-session';

const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const conflict=(message:string)=>new MobileError(message,409,'RETURN_REVIEW_REQUIRED');
const invalid=()=>new MobileError('Thông tin quyết toán trả xe chưa hợp lệ.',400,'INVALID_RETURN_SETTLEMENT');
const bounded=(n:number)=>Number.isSafeInteger(n)&&n>=0&&n<=9999999999999;
export function parseMobileReturnSettlement(body:Record<string,unknown>):MobileReturnSettlementInput {
  if(Object.keys(body).some(k=>!['revision','items','fee_snapshot','settlement','acknowledge_overpayment'].includes(k))||
    typeof body.revision!=='string'||!/^[1-9]\d{0,19}$/.test(body.revision)||typeof body.fee_snapshot!=='string'||!/^[a-f0-9]{64}$/.test(body.fee_snapshot)||
    body.acknowledge_overpayment!==undefined&&body.acknowledge_overpayment!==true||!object(body.settlement))throw invalid();
  const settlement=parseMobileReturnMoney(body.settlement,body.revision);
  return{revision:body.revision,items:parseReturnBatch({items:body.items}),fee_snapshot:body.fee_snapshot,settlement,
    ...(body.acknowledge_overpayment===true?{acknowledge_overpayment:true}:{})};
}
/** Shared explicit money DTO for original returns and corrections; no request IDs. */
export function parseMobileReturnMoney(raw:unknown,revision:string):MobileReturnSettlement {
  if(!object(raw))throw invalid();
  const input=raw;
  if(Object.keys(input).some(k=>!['receipts','refund','rental_refund','refund_deferred','refund_recipient'].includes(k))||!Array.isArray(input.receipts)||input.receipts.length>50||
    input.refund_deferred!==undefined&&(input.refund_deferred!==true||input.refund!==undefined))throw invalid();
  const parseMoney=(value:unknown,refund=false):MobileReturnRefund=>{
    if(!object(value)||Object.keys(value).some(k=>!['amount','method','account_id','paid_at',...(refund?['recipient_bank','recipient_account','recipient_name']:['kind'])].includes(k)))throw invalid();
    // Reuse the domain's amount/method/date validation. This constant is a parser
    // placeholder only; no UUID is allocated, returned, reserved or persisted.
    const parsed=parseContractPayment({request_id:'00000000-0000-4000-8000-000000000000',revision,
      amount:value.amount,method:value.method,account_id:value.account_id,paid_at:value.paid_at,note:''});
    const result:MobileReturnRefund={amount:parsed.amount,method:parsed.method,account_id:parsed.account_id,paid_at:parsed.paid_at};
    if(refund)for(const key of ['recipient_bank','recipient_account','recipient_name'] as const){
      if(value[key]!==undefined&&(typeof value[key]!=='string'||value[key].length>150))throw invalid();
      const text=String(value[key]??'').trim();
      if(parsed.method!=='cash'&&text){
        if(key==='recipient_account'&&!validRefundAccount(text))throw invalid();
        result[key]=key==='recipient_account'?normalizeRefundAccount(text):text;
      }
    }
    return result;
  };
  const settlement:MobileReturnSettlement={receipts:input.receipts.map(value=>{
    const parsed=parseMoney(value);const kind=(value as Record<string,unknown>).kind;
    if(kind!=='late_fee'&&kind!=='repair_fee'&&kind!=='rental_debt')throw invalid();
    return{...parsed,kind};
  })};
  if(input.refund!==undefined)settlement.refund=parseMoney(input.refund,true);
  if(input.rental_refund!==undefined)settlement.rental_refund=parseMoney(input.rental_refund,true);
  if(input.refund_deferred===true)settlement.refund_deferred=true;
  if(input.refund_recipient!==undefined){
    const row=input.refund_recipient;
    if(input.refund_deferred!==true||!object(row)||Object.entries(row).some(([k,v])=>!['bank','account','name'].includes(k)||typeof v!=='string'||v.length>150)||
      typeof row.account==='string'&&row.account.trim()&&!validRefundAccount(row.account))throw invalid();
    settlement.refund_recipient=Object.fromEntries(Object.entries(row).map(([k,v])=>[k,k==='account'?normalizeRefundAccount(String(v)):String(v).trim()]).filter(([,v])=>v));
  }
  return settlement;
}
export async function readMobileReturnSettlementPreview(user:SessionUser,value:string,request:NextRequest):Promise<MobileReturnSettlementPreview> {
  requireMobileReturn(user);const id=mobileFinanceId(value);
  if([...request.nextUrl.searchParams].length)throw new MobileError('Không hỗ trợ bộ lọc khi rà soát quyết toán.',400,'INVALID_QUERY');
  try{
    const input=parseMobileReturnSettlement(await mobileBody(request,98304));
    return await withMobileData(user,'',async()=>{
      const client=await himotoPool.connect();
      try{
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await client.query("SET LOCAL statement_timeout='20s'");await client.query("SET LOCAL lock_timeout='5s'");
        const result=await readReturnSettlementPreview(client,user,id,input);await client.query('COMMIT');return result;
      }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
    });
  }catch(error){
    if(error instanceof ContractReturnError||error instanceof ContractPaymentError)
      throw new MobileError(error.message,error.status,error.status===404?'NOT_FOUND':'RETURN_REVIEW_REQUIRED');
    throw error;
  }
}
export async function readReturnSettlementPreview(client:Pick<PoolClient,'query'>,user:SessionUser,id:number,input:MobileReturnSettlementInput):Promise<MobileReturnSettlementPreview> {
  const clock=Date.now(),fees=await readReturnFeePreview(client,user,id,input,clock);
  if(fees.snapshot!==input.fee_snapshot)throw conflict('Phí, xe hoặc số dư đã thay đổi. Rà soát phí trả xe lại trước khi quyết toán.');
  const context=await readPaymentContext(client,id,{page:1,size:0,asOf:clock});
  const creditRow=(await client.query(`SELECT o.draft_payload #> '{management_composer,return_adjustments}' AS adjustments,
    COALESCE((SELECT sum(t.value) FROM himoto.transactions t WHERE t.order_id=o.id AND t.type='out' AND t.name='order:rental_refund' AND t.status='approved'),0)::text AS refunded
    FROM himoto.orders o WHERE o.id=$1 AND o.deleted_at IS NULL`,[id])).rows[0];
  const priorCredit=(Array.isArray(creditRow.adjustments)?creditRow.adjustments:[]).reduce((sum:number,row:{early_discount?:unknown})=>{
    const amount=Number(row?.early_discount??0);return sum+(bounded(amount)?amount:0);
  },0)-Number(creditRow.refunded)+fees.totals.earlyDiscount;
  if(!Number.isSafeInteger(priorCredit))throw conflict('Lịch sử giảm/hoàn tiền thuê cần đối chiếu.');
  let total=fees.after.totalAmount,paid=fees.after.rentalPaid,deposit=fees.after.depositHeld,overpayment=false;
  const totals={income:0,rentalRefund:0,depositRefund:0,totalIncrease:0},payments:MobileReturnSettlementPreview['payments']=[];
  const account=(payment:MobileReturnMoney)=>{
    const row=findPaymentAccount(context,payment.method,payment.account_id);
    if(!row)throw conflict('Tài khoản thu/chi không khớp phương thức hoặc cơ sở hiện tại.');return row.label;
  };
  for(const row of input.settlement.receipts){
    if(context.completed_from_hold)throw conflict('Hợp đồng đã hoàn thành sau bảo lưu; không thu thêm khoản đã miễn.');
    const label=account(row),amount=Number(row.amount),impact=paymentImpact({totalAmount:total,rentalRemaining:Math.max(total-paid,0)},'debt',amount);
    total=impact.totalAfter!;paid+=amount;overpayment ||=impact.overpayment;totals.income+=amount;totals.totalIncrease+=impact.totalIncrease;
    if(![total,paid,totals.income,totals.totalIncrease].every(bounded))throw conflict('Tổng thu hoặc phí quyết toán vượt giới hạn.');
    payments.push({...row,label,totalIncrease:impact.totalIncrease});
  }
  const rentalRefund=input.settlement.rental_refund;
  if(rentalRefund){
    const amount=Number(rentalRefund.amount),label=account(rentalRefund),limit=Math.max(Math.min(priorCredit,paid-total),0);
    if(amount>limit)throw conflict('Số tiền hoàn vượt khoản giảm thuê trả sớm và tiền thực tế đã thu dư.');
    paid-=amount;totals.rentalRefund=amount;payments.push({...rentalRefund,kind:'rental_refund',label,totalIncrease:0});
  }
  const depositRefund=input.settlement.refund;
  if(depositRefund){
    const amount=Number(depositRefund.amount),label=account(depositRefund);
    if(!fees.after.closesRental||paid<total)throw conflict('Chỉ hoàn cọc khi đã nhận đủ xe và thu đủ công nợ.');
    if(amount>deposit)throw conflict('Số tiền hoàn vượt cọc đang giữ.');
    deposit-=amount;totals.depositRefund=amount;payments.push({...depositRefund,kind:'deposit_refund',label,totalIncrease:0});
  }
  const remaining=Math.max(total-paid,0);
  const after={...fees.after,totalAmount:total,rentalPaid:paid,rentalRemaining:remaining,depositHeld:deposit,
    rentalRefundable:Math.max(Math.min(priorCredit-totals.rentalRefund,paid-total),0),
    depositRefundEligible:fees.after.closesRental&&remaining===0&&deposit>0,
    status:fees.after.closesRental?(remaining===0?'completed':'wait_payment'):fees.after.status};
  const snapshot=createHash('sha256').update(JSON.stringify({fees:fees.snapshot,settlement:input.settlement,payments,totals,after,overpayment,
    acknowledged:input.acknowledge_overpayment===true})).digest('hex');
  const result:MobileReturnSettlementPreview={phase:'settlement',id,revision:fees.revision,snapshot,fees,settlement:input.settlement,payments,totals,after,
    overpayment,overpaymentAcknowledged:input.acknowledge_overpayment===true,observedAt:fees.observedAt};
  if(!isMobileReturnSettlementPreview(result))throw conflict('Kết quả quyết toán cần đối chiếu trước khi tiếp tục.');
  return result;
}
