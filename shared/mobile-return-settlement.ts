import {isMobileReturnPreview,type MobileReturnPreview,type MobileReturnPreviewInput} from './mobile-returns';
import type {MobileCollectionMethod} from './mobile-contract';

export interface MobileReturnMoney {
  amount:string;method:MobileCollectionMethod;account_id:number;paid_at:string;
}
export interface MobileReturnRefund extends MobileReturnMoney {
  recipient_bank?:string;recipient_account?:string;recipient_name?:string;
}
export interface MobileReturnSettlement {
  receipts:(MobileReturnMoney&{kind:'late_fee'|'repair_fee'|'rental_debt'})[];
  refund?:MobileReturnRefund;rental_refund?:MobileReturnRefund;refund_deferred?:true;
  refund_recipient?:{bank?:string;account?:string;name?:string};
}
export interface MobileReturnSettlementInput extends MobileReturnPreviewInput {
  fee_snapshot:string;settlement:MobileReturnSettlement;acknowledge_overpayment?:true;
}
export interface MobileReturnSettlementPreview {
  phase:'settlement';id:number;revision:string;snapshot:string;fees:MobileReturnPreview;
  settlement:MobileReturnSettlement;
  payments:(MobileReturnMoney&{kind:'late_fee'|'repair_fee'|'rental_debt'|'rental_refund'|'deposit_refund';label:string;totalIncrease:number})[];
  totals:{income:number;rentalRefund:number;depositRefund:number;totalIncrease:number};
  overpayment:boolean;overpaymentAcknowledged:boolean;
  after:MobileReturnPreview['after'];observedAt:string;
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const money=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=9999999999999;
const time=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)&&Number.isFinite(Date.parse(`${v}:00+07:00`))&&
  new Date(Date.parse(`${v}:00+07:00`)+7*3600000).toISOString().slice(0,16)===v;
const text=(v:unknown)=>typeof v==='string'&&v.length<=150;
function payment(v:unknown):v is MobileReturnMoney {
  return object(v)&&typeof v.amount==='string'&&/^[1-9]\d{0,12}$/.test(v.amount)&&money(Number(v.amount))&&
    ['cash','transfer','company_transfer'].includes(String(v.method))&&typeof v.account_id==='number'&&Number.isSafeInteger(v.account_id)&&v.account_id>0&&time(v.paid_at);
}
function refund(v:unknown):v is MobileReturnRefund {
  return payment(v)&&['recipient_bank','recipient_account','recipient_name'].every(k=>!(k in v)||text((v as unknown as Record<string,unknown>)[k]));
}
export function isMobileReturnSettlement(v:unknown):v is MobileReturnSettlement {
  return object(v)&&Array.isArray(v.receipts)&&v.receipts.length<=50&&v.receipts.every(row=>payment(row)&&object(row)&&['late_fee','repair_fee','rental_debt'].includes(String(row.kind)))&&
    (v.refund===undefined||refund(v.refund))&&(v.rental_refund===undefined||refund(v.rental_refund))&&
    (v.refund_deferred===undefined||v.refund_deferred===true&&v.refund===undefined)&&
    (v.refund_recipient===undefined||v.refund_deferred===true&&object(v.refund_recipient)&&Object.entries(v.refund_recipient).every(([k,x])=>['bank','account','name'].includes(k)&&text(x)));
}
export function isMobileReturnSettlementPreview(v:unknown):v is MobileReturnSettlementPreview {
  if(!object(v)||v.phase!=='settlement'||!isMobileReturnPreview(v.fees)||v.id!==v.fees.id||v.revision!==v.fees.revision||
    typeof v.snapshot!=='string'||!/^[a-f0-9]{64}$/.test(v.snapshot)||!isMobileReturnSettlement(v.settlement)||
    !Array.isArray(v.payments)||v.payments.length>52||!object(v.totals)||!Object.values(v.totals).every(money)||
    !['income','rentalRefund','depositRefund','totalIncrease'].every(k=>money((v.totals as Record<string,unknown>)[k]))||
    typeof v.overpayment!=='boolean'||typeof v.overpaymentAcknowledged!=='boolean'||v.observedAt!==v.fees.observedAt)return false;
  const expected=[...v.settlement.receipts,...(v.settlement.rental_refund?[{...v.settlement.rental_refund,kind:'rental_refund'}]:[]),
    ...(v.settlement.refund?[{...v.settlement.refund,kind:'deposit_refund'}]:[])];
  if(v.payments.length!==expected.length)return false;
  let total=v.fees.after.totalAmount,paid=v.fees.after.rentalPaid,deposit=v.fees.after.depositHeld,overpayment=false;
  const sums={income:0,rentalRefund:0,depositRefund:0,totalIncrease:0};
  for(let i=0;i<expected.length;i++){
    const row=v.payments[i],input=expected[i];
    if(!payment(row)||!object(row)||!money(row.totalIncrease)||typeof row.label!=='string'||row.label.length>4000||
      !['amount','method','account_id','paid_at','kind'].every(k=>row[k]===input[k as keyof typeof input]))return false;
    const amount=Number(row.amount),remaining=Math.max(total-paid,0),income=i<v.settlement.receipts.length;
    const increase=income&&remaining>0&&amount>remaining?amount-remaining:0;
    if(row.totalIncrease!==increase)return false;
    if(income){overpayment ||=amount>remaining;total+=increase;paid+=amount;sums.income+=amount;sums.totalIncrease+=increase;}
    else if(row.kind==='rental_refund'){paid-=amount;sums.rentalRefund+=amount;}
    else{deposit-=amount;sums.depositRefund+=amount;}
  }
  const after=v.after,fees=v.fees.after,remaining=Math.max(total-paid,0);
  const totals=v.totals;
  return Object.entries(sums).every(([k,n])=>totals[k]===n)&&v.overpayment===overpayment&&object(after)&&
    money(total)&&money(paid)&&money(deposit)&&after.totalAmount===total&&after.rentalPaid===paid&&after.depositHeld===deposit&&after.rentalRemaining===remaining&&
    money(after.rentalRefundable)&&after.rentalRefundable<=Math.max(paid-total,0)&&after.remainingItems===fees.remainingItems&&after.closesRental===fees.closesRental&&
    after.depositRefundEligible===(fees.closesRental&&remaining===0&&deposit>0)&&after.status===(fees.closesRental?(remaining===0?'completed':'wait_payment'):fees.status)&&
    (sums.depositRefund===0||fees.closesRental&&remaining===0);
}

// Bind the request as well as the response: never display another fee selection
// or receiving account as the result of the operator's current review.
export function matchesReturnFees(value:MobileReturnPreview,input:MobileReturnPreviewInput) {
  return value.revision===input.revision&&value.items.length===input.items.length&&value.items.every(row=>input.items.some(item=>
    item.item_id===row.id&&item.item_revision===row.revision&&Date.parse(row.returnedAt)===Date.parse(`${item.returned_at}:00+07:00`)&&
    row.hourlyRate===Number(item.hourly_rate)&&row.repairFee===Number(item.repair_fee??0)&&row.earlyDiscount===Number(item.early_discount??0)&&
    row.repairNote===(item.repair_fee===undefined?'':(item.repair_note??'').trim())&&row.overridden===(item.fee_override!==undefined)&&
    (item.fee_override===undefined||row.lateFee===Number(item.fee_override))));
}

export function matchesReturnSettlement(value:MobileReturnSettlementPreview,input:MobileReturnSettlementInput) {
  const canonicalMoney=(row:MobileReturnMoney,refund=false)=>({amount:row.amount,method:row.method,account_id:row.account_id,paid_at:row.paid_at,
    ...(refund&&row.method!=='cash'?Object.fromEntries((['recipient_bank','recipient_account','recipient_name'] as const).flatMap(k=>{
      const text=String((row as MobileReturnRefund)[k]??'').trim();return text?[[k,k==='recipient_account'?text.replace(/[\s.]/g,''):text]]:[];
    })): {})});
  const canonical=(row:MobileReturnSettlement)=>({receipts:row.receipts.map(p=>({...canonicalMoney(p),kind:p.kind})),
    ...(row.rental_refund?{rental_refund:canonicalMoney(row.rental_refund,true)}:{}),...(row.refund?{refund:canonicalMoney(row.refund,true)}:{}),
    ...(row.refund_deferred?{refund_deferred:true}:{}),...(row.refund_recipient?{refund_recipient:Object.fromEntries(
      (['bank','account','name'] as const).flatMap(k=>{
        const text=String(row.refund_recipient?.[k]??'').trim();return text?[[k,k==='account'?text.replace(/[\s.]/g,''):text]]:[];
      }))}: {})});
  return value.fees.snapshot===input.fee_snapshot&&matchesReturnFees(value.fees,input)&&
    value.overpaymentAcknowledged===(input.acknowledge_overpayment===true)&&JSON.stringify(canonical(value.settlement))===JSON.stringify(canonical(input.settlement));
}
