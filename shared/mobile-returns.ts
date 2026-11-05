import type { MobileCollectionMethod } from './mobile-contract';

export interface MobileReturnPreviewInput {
  revision:string;
  items:{item_id:number;item_revision:string;returned_at:string;hourly_rate:string;fee_override?:string;early_discount?:string;repair_fee?:string;repair_note?:string}[];
}

/** Fee review only. Actual receipts/refunds require a separate settlement review. */
export interface MobileReturnPreview {
  phase:'fees';id:number;code:string;revision:string;snapshot:string;ownership:boolean;
  items:{id:number;vehicleId:number;revision:string;name:string;license:string;returnAt:string;returnedAt:string;
    lateMinutes:number;chargeableHours:number;lateDays:number;lateHours:number;hourlyRate:number;dailyPrice:number|null;
    suggestedLateFee:number|null;lateFee:number;repairFee:number;repairNote:string;earlyDiscount:number;fee:number;overridden:boolean}[];
  before:{totalAmount:number;rentalPaid:number;rentalRemaining:number;depositHeld:number;rentalRefundable:number};
  after:{totalAmount:number;rentalPaid:number;rentalRemaining:number;depositHeld:number;rentalRefundable:number;remainingItems:number;closesRental:boolean;depositRefundEligible:boolean;status:string};
  totals:{lateFee:number;repairFee:number;earlyDiscount:number;fee:number};observedAt:string;
}

export interface MobileReturnPreparation {
  id:number;code:string;status:string;storeId:number;revision:string;
  available:boolean;blockedReason:string|null;ownership:boolean;holdActive:boolean;completedFromHold:boolean;
  totalAmount:number|null;rentalPaid:number|null;rentalRemaining:number|null;depositHeld:number;rentalRefundable:number;
  items:{page:number;pages:number;total:number;rows:{
    id:number;vehicleId:number;name:string;license:string;revision:string;
    startsAt:string|null;returnAt:string|null;completedAt:string|null;dailyPrice:number|null;
    overdue:boolean;reconciled:boolean;available:boolean;blockedReason:string|null;
  }[]};
  accounts:{id:number;method:MobileCollectionMethod;label:string}[];observedAt:string;
}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const positive=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
const money=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=9999999999999;
const text=(value:unknown):value is string=>typeof value==='string'&&value.length<=4000;
const revision=(value:unknown)=>typeof value==='string'&&/^[1-9]\d{0,19}$/.test(value);
const time=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&value.length<=40&&Number.isFinite(Date.parse(value));
const gate=(value:Record<string,unknown>)=>typeof value.available==='boolean'&&(value.blockedReason===null||text(value.blockedReason)&&value.blockedReason.length>0)&&value.available===(value.blockedReason===null);
export function isMobileReturnPreparation(value:unknown):value is MobileReturnPreparation {
  if(!object(value)||!positive(value.id)||!positive(value.storeId)||!text(value.code)||!text(value.status)||!revision(value.revision)||!gate(value)||
    ![value.ownership,value.holdActive,value.completedFromHold].every(row=>typeof row==='boolean')||!time(value.observedAt)||
    ![value.totalAmount,value.rentalPaid,value.rentalRemaining].every(row=>row===null||money(row))||!money(value.depositHeld)||!money(value.rentalRefundable))return false;
  if(value.available&&(!['renting','overdue','wait_payment'].includes(value.status)||value.totalAmount===null||value.rentalPaid===null||value.rentalRemaining===null))return false;
  if(value.totalAmount!==null&&value.rentalPaid!==null&&value.rentalRemaining!==Math.max((value.totalAmount as number)-(value.rentalPaid as number),0))return false;
  const items=value.items,accounts=value.accounts;
  return object(items)&&positive(items.page)&&positive(items.pages)&&items.page<=items.pages&&money(items.total)&&items.total<=1000000&&(!value.available||items.total>0)&&
    items.pages===Math.max(1,Math.ceil(items.total/25))&&Array.isArray(items.rows)&&items.rows.length===Math.max(0,Math.min(25,items.total-(items.page-1)*25))&&
    items.rows.every(row=>object(row)&&positive(row.id)&&positive(row.vehicleId)&&text(row.name)&&text(row.license)&&revision(row.revision)&&
      [row.startsAt,row.returnAt,row.completedAt].every(at=>at===null||time(at))&&(row.dailyPrice===null||money(row.dailyPrice)&&row.dailyPrice>0)&&
      typeof row.overdue==='boolean'&&typeof row.reconciled==='boolean'&&gate(row)&&
      (!row.available||value.available&&row.completedAt===null&&row.returnAt!==null&&!row.reconciled))&&
    new Set(items.rows.map(row=>row.id)).size===items.rows.length&&Array.isArray(accounts)&&accounts.length<=10000&&
    accounts.every(row=>object(row)&&positive(row.id)&&['cash','transfer','company_transfer'].includes(String(row.method))&&text(row.label))&&
    new Set(accounts.map(row=>`${row.method}:${row.id}`)).size===accounts.length;
}

function previewLine(value:unknown):value is MobileReturnPreview['items'][number] {
  if(!object(value)||!positive(value.id)||!positive(value.vehicleId)||!revision(value.revision)||!text(value.name)||!text(value.license)||!time(value.returnAt)||!time(value.returnedAt)||
    ![value.lateMinutes,value.chargeableHours,value.lateDays,value.lateHours,value.hourlyRate,value.lateFee,value.repairFee,value.earlyDiscount].every(money)||
    !(value.dailyPrice===null||money(value.dailyPrice)&&value.dailyPrice>0)||!(value.suggestedLateFee===null||money(value.suggestedLateFee))||
    typeof value.fee!=='number'||!money(Math.abs(value.fee))||typeof value.overridden!=='boolean'||!text(value.repairNote)||value.repairNote.length>1000)return false;
  const row=value as unknown as MobileReturnPreview['items'][number];
  if(row.hourlyRate>5000000||row.lateHours>8||row.fee!==row.lateFee+row.repairFee-row.earlyDiscount)return false;
  const minutes=Math.max(0,Math.ceil((Date.parse(row.returnedAt)-Date.parse(row.returnAt))/60000));
  const days=Math.floor(minutes/1440)+(minutes%1440>480?1:0),hours=minutes%1440>480?0:Math.ceil(minutes%1440/60);
  const suggested=days&&row.dailyPrice===null?null:days*(row.dailyPrice??0)+hours*row.hourlyRate;
  return row.lateMinutes===minutes&&row.chargeableHours===Math.ceil(minutes/60)&&row.lateDays===days&&row.lateHours===hours&&row.suggestedLateFee===suggested&&
    (row.overridden?minutes>0:row.lateFee===suggested)&&!(row.earlyDiscount>0&&Date.parse(row.returnedAt)>=Date.parse(row.returnAt));
}
function previewBalance(value:unknown):value is MobileReturnPreview['before']&Record<string,unknown> {
  return object(value)&&money(value.totalAmount)&&money(value.rentalPaid)&&money(value.rentalRemaining)&&money(value.depositHeld)&&money(value.rentalRefundable)&&
    value.rentalRemaining===Math.max(value.totalAmount-value.rentalPaid,0)&&value.rentalRefundable<=Math.max(value.rentalPaid-value.totalAmount,0);
}
export function isMobileReturnPreview(value:unknown):value is MobileReturnPreview {
  if(!object(value)||value.phase!=='fees'||!positive(value.id)||!text(value.code)||!revision(value.revision)||
    typeof value.snapshot!=='string'||!/^[a-f0-9]{64}$/.test(value.snapshot)||typeof value.ownership!=='boolean'||!time(value.observedAt)||
    !Array.isArray(value.items)||!value.items.length||value.items.length>50||!value.items.every(previewLine)||new Set(value.items.map(row=>row.id)).size!==value.items.length)return false;
  const {before,after,totals}=value;
  if(!previewBalance(before)||!object(after)||!previewBalance(after)||!object(totals)||
    !money(totals.lateFee)||!money(totals.repairFee)||!money(totals.earlyDiscount)||typeof totals.fee!=='number'||!money(Math.abs(totals.fee))||
    totals.fee!==totals.lateFee+totals.repairFee-totals.earlyDiscount||!money(after.remainingItems)||
    after.closesRental!==(after.remainingItems===0)||after.depositRefundEligible!==(after.closesRental&&after.rentalRemaining===0&&after.depositHeld>0)||
    !['renting','overdue','wait_payment','completed'].includes(String(after.status))||
    (after.remainingItems===0?after.status!==(after.rentalRemaining===0?'completed':'wait_payment'):after.status==='completed')||
    after.rentalPaid!==before.rentalPaid||after.depositHeld!==before.depositHeld)return false;
  const items=value.items;
  if(!value.ownership&&after.totalAmount!==before.totalAmount+totals.fee||value.ownership&&items.some(row=>row.earlyDiscount!==0))return false;
  return (['lateFee','repairFee','earlyDiscount','fee'] as const).every(key=>totals[key]===items.reduce((sum,row)=>sum+row[key],0));
}
