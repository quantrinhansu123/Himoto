export interface MobileRecoveryAmounts {
  totalAmount:number|null;rentalPaid:number|null;rentalRemaining:number|null;rentalOverpayment:number|null;depositHeld:number;
}
export interface MobileRecoveryItem {
  id:number;vehicleId:number;revision:string;name:string;license:string;startsAt:string|null;completedAt:string|null;
  available:boolean;blockedReason:string|null;
}
export interface MobileRecoveryPreparation {
  id:number;code:string;storeId:number;revision:string;status:string;ownership:boolean;hasInstallmentPlan:boolean;
  available:boolean;blockedReason:string|null;badDebtAt:string|null;billingStoppedAt:string|null;remainingItems:number;
  amounts:MobileRecoveryAmounts;settled:boolean;
  items:{page:number;pages:number;total:number;rows:MobileRecoveryItem[]};observedAt:string;
}
export interface MobileRecoveryInput {revision:string;item_id:number;item_revision:string;recovered_at:string;note:string}
export interface MobileRecoveryRecordInput extends MobileRecoveryInput {review_snapshot:string}
export interface MobileRecoveryReceipt {
  id:number;revision:string;requestId:string;replayed:boolean;review:MobileRecoveryPreview;itemRevision:string;
  actorId:number;actorName:string;recordedAt:string;
  event:{itemId:number;vehicleId:number;recoveredAt:string;recordedAt:string;actorId:number;note:string;requestHash:string};
  financialFingerprint:string;itemCurrent:boolean;historyCurrent:boolean;moneyCurrent:boolean;contractCurrent:boolean;current:boolean;
}
export interface MobileRecoveryPreview {
  id:number;code:string;storeId:number;revision:string;status:'bad_debt';ownership:boolean;hasInstallmentPlan:boolean;
  item:MobileRecoveryItem;recoveredAt:string;note:string;badDebtAt:string|null;billingStoppedAt:string|null;
  before:MobileRecoveryAmounts;after:MobileRecoveryAmounts&{status:'bad_debt'|'completed';remainingItems:number};settled:boolean;
  snapshot:string;observedAt:string;
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=1000000;
const money=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=9999999999999;
const text=(v:unknown):v is string=>typeof v==='string'&&v.length<=4000;
const revision=(v:unknown)=>typeof v==='string'&&/^[1-9]\d{0,19}$/.test(v);
const time=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&v.length<=40&&Number.isFinite(Date.parse(v));
const nullableTime=(v:unknown)=>v===null||time(v);
const gate=(v:Record<string,unknown>)=>typeof v.available==='boolean'&&(v.blockedReason===null||text(v.blockedReason)&&v.blockedReason.length>0)&&v.available===(v.blockedReason===null);
export function isMobileRecoveryAmounts(v:unknown):v is MobileRecoveryAmounts {
  if(!object(v)||![v.totalAmount,v.rentalPaid,v.rentalRemaining,v.rentalOverpayment].every(n=>n===null||money(n))||!money(v.depositHeld))return false;
  return v.totalAmount===null||v.rentalPaid===null?v.rentalRemaining===null&&v.rentalOverpayment===null:
    v.rentalRemaining===Math.max(Number(v.totalAmount)-Number(v.rentalPaid),0)&&v.rentalOverpayment===Math.max(Number(v.rentalPaid)-Number(v.totalAmount),0);
}
export function isMobileRecoveryItem(v:unknown):v is MobileRecoveryItem {
  return object(v)&&positive(v.id)&&positive(v.vehicleId)&&revision(v.revision)&&text(v.name)&&text(v.license)&&
    nullableTime(v.startsAt)&&nullableTime(v.completedAt)&&gate(v)&&(!v.available||v.completedAt===null);
}
export function isMobileRecoveryPreparation(v:unknown):v is MobileRecoveryPreparation {
  if(!object(v)||!positive(v.id)||!text(v.code)||!positive(v.storeId)||!revision(v.revision)||!text(v.status)||!gate(v)||
    ![v.ownership,v.hasInstallmentPlan,v.settled].every(x=>typeof x==='boolean')||!nullableTime(v.badDebtAt)||!nullableTime(v.billingStoppedAt)||
    !count(v.remainingItems)||!isMobileRecoveryAmounts(v.amounts)||!time(v.observedAt)||v.available&&(v.status!=='bad_debt'||v.remainingItems===0||v.hasInstallmentPlan&&v.billingStoppedAt===null))return false;
  const p=v.items;
  return object(p)&&positive(p.page)&&positive(p.pages)&&p.page<=p.pages&&count(p.total)&&p.pages===Math.max(1,Math.ceil(p.total/25))&&Number(v.remainingItems)<=p.total&&
    Array.isArray(p.rows)&&p.rows.length===Math.max(0,Math.min(25,p.total-(p.page-1)*25))&&p.rows.every(row=>isMobileRecoveryItem(row)&&(!row.available||v.available))&&new Set(p.rows.map(row=>row.id)).size===p.rows.length;
}
export function isMobileRecoveryPreview(v:unknown):v is MobileRecoveryPreview {
  if(!object(v)||!positive(v.id)||!text(v.code)||!positive(v.storeId)||!revision(v.revision)||v.status!=='bad_debt'||
    ![v.ownership,v.hasInstallmentPlan,v.settled].every(x=>typeof x==='boolean')||!isMobileRecoveryItem(v.item)||!v.item.available||!time(v.recoveredAt)||
    v.item.startsAt!==null&&Date.parse(v.recoveredAt)<Date.parse(v.item.startsAt)||!text(v.note)||v.note.length>1000||v.note!==v.note.trim()||
    !nullableTime(v.badDebtAt)||!nullableTime(v.billingStoppedAt)||v.hasInstallmentPlan&&v.billingStoppedAt===null||
    !isMobileRecoveryAmounts(v.before)||!object(v.after)||!isMobileRecoveryAmounts(v.after)||!count(v.after.remainingItems)||
    v.after.status!==(v.after.remainingItems===0&&v.settled?'completed':'bad_debt')||!time(v.observedAt)||typeof v.snapshot!=='string'||!/^[a-f0-9]{64}$/.test(v.snapshot))return false;
  const before=v.before,after=v.after;
  return (['totalAmount','rentalPaid','rentalRemaining','rentalOverpayment','depositHeld'] as const).every(key=>before[key]===after[key]);
}
export function matchesRecoveryPreview(v:MobileRecoveryPreview,input:MobileRecoveryInput) {
  return v.revision===input.revision&&v.item.id===input.item_id&&v.item.revision===input.item_revision&&v.note===input.note.trim()&&
    Date.parse(v.recoveredAt)===Date.parse(input.recovered_at+':00+07:00');
}
export function isMobileRecoveryReceipt(v:unknown):v is MobileRecoveryReceipt {
  const uuid=(x:unknown)=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x);
  const hash=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
  if(!object(v)||!positive(v.id)||!revision(v.revision)||!uuid(v.requestId)||typeof v.replayed!=='boolean'||
    !isMobileRecoveryPreview(v.review)||v.review.id!==v.id||!revision(v.itemRevision)||!positive(v.actorId)||!text(v.actorName)||!time(v.recordedAt)||
    !hash(v.financialFingerprint)||![v.itemCurrent,v.historyCurrent,v.moneyCurrent,v.contractCurrent,v.current].every(x=>typeof x==='boolean')||
    v.current!==(v.itemCurrent&&v.historyCurrent&&v.moneyCurrent&&v.contractCurrent)||!object(v.event))return false;
  const e=v.event;
  return e.itemId===v.review.item.id&&e.vehicleId===v.review.item.vehicleId&&e.recoveredAt===v.review.recoveredAt&&
    e.recordedAt===v.recordedAt&&e.actorId===v.actorId&&e.note===v.review.note&&hash(e.requestHash);
}
