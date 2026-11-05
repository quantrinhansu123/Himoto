import type {MobileCollectionMethod,MobileWriteReceipt} from './mobile-contract';
import {isMobileReturnSettlementPreview,type MobileReturnSettlementInput,type MobileReturnSettlementPreview} from './mobile-return-settlement';

export interface MobileReturnRecordInput extends MobileReturnSettlementInput {settlement_snapshot:string}
export interface MobileReturnReceipt extends MobileWriteReceipt {
  requestId:string;review:MobileReturnSettlementPreview;recordedAt:string;
  returnedItems:{id:number;vehicleId:number;revision:string;returnedAt:string}[];
  transactions:{id:number;requestId:string;revision:string;paymentRevision:string;kind:MobileReturnSettlementPreview['payments'][number]['kind'];
    amount:number;method:MobileCollectionMethod;accountId:number;paidAt:string}[];
  itemsCurrent:boolean;paymentsCurrent:boolean;contractCurrent:boolean;current:boolean;
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const revision=(v:unknown)=>typeof v==='string'&&/^[1-9]\d{0,19}$/.test(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const time=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&v.length<=40&&Number.isFinite(Date.parse(v));
export function isMobileReturnReceipt(v:unknown):v is MobileReturnReceipt {
  if(!object(v)||!positive(v.id)||!revision(v.revision)||!uuid(v.requestId)||typeof v.replayed!=='boolean'||!time(v.recordedAt)||
    !isMobileReturnSettlementPreview(v.review)||v.review.id!==v.id||v.review.overpayment&&!v.review.overpaymentAcknowledged||
    ![v.itemsCurrent,v.paymentsCurrent,v.contractCurrent,v.current].every(x=>typeof x==='boolean')||v.current!==(v.itemsCurrent&&v.paymentsCurrent&&v.contractCurrent)||
    !Array.isArray(v.returnedItems)||v.returnedItems.length!==v.review.fees.items.length||
    !Array.isArray(v.transactions)||v.transactions.length!==v.review.payments.length)return false;
  const lines=v.review.fees.items,payments=v.review.payments;
  if(!v.returnedItems.every(row=>object(row)&&positive(row.id)&&positive(row.vehicleId)&&revision(row.revision)&&time(row.returnedAt)&&
    lines.some(line=>line.id===row.id&&line.vehicleId===row.vehicleId&&Date.parse(line.returnedAt)===Date.parse(String(row.returnedAt))))||
    new Set(v.returnedItems.map(row=>row.id)).size!==v.returnedItems.length)return false;
  return v.transactions.every((row,i)=>object(row)&&positive(row.id)&&uuid(row.requestId)&&row.requestId!==v.requestId&&revision(row.revision)&&revision(row.paymentRevision)&&
    row.kind===payments[i].kind&&row.amount===Number(payments[i].amount)&&row.method===payments[i].method&&row.accountId===payments[i].account_id&&time(row.paidAt)&&
    Date.parse(row.paidAt)===Date.parse(`${payments[i].paid_at}:00+07:00`))&&
    new Set(v.transactions.map(row=>row.id)).size===v.transactions.length&&new Set(v.transactions.map(row=>row.requestId)).size===v.transactions.length;
}
