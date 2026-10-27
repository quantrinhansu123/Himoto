import type { ManagementRow } from './types';
import { DEFAULT_LATE_HOURLY_RATE,lateReturnFee } from './return-fees';
import { OWNERSHIP_CONTRACT_TYPES } from './config';
import { badDebtClock } from './contract-bad-debt';
import { legacyOwnershipLateFee } from './legacy-ownership-overdue';

export const OVERDUE_BUCKETS=[
  {key:'traditional-overdue',label:'Quá hạn'}, {key:'traditional-3',label:'Trên 3 ngày'}, {key:'traditional-10',label:'Trên 10 ngày'},
  {key:'traditional-bad-debt',label:'Nợ xấu'},
  {key:'ownership-overdue',label:'Quá hạn'}, {key:'ownership-1-5',label:'1–5 ngày'}, {key:'ownership-6-15',label:'6–15 ngày'}, {key:'ownership-15-plus',label:'Trên 15 ngày'},
  {key:'ownership-bad-debt',label:'Nợ xấu'},
] as const;
export type OverdueBucket=typeof OVERDUE_BUCKETS[number]['key'];
export function isOwnershipContract(row:ManagementRow){return row.store_kind==='lease_to_own'||OWNERSHIP_CONTRACT_TYPES.has(String(row.rental_type));}
export function usesLegacyOwnershipFees(row:ManagementRow){return Boolean(row.legacy_source_store_id&&row.legacy_source_store_id!=='30'&&isOwnershipContract(row)&&!row.billing_plan_json);}
export function matchesOverdueBucket(row:ManagementRow,bucket:string){
  if(!bucket)return true;
  const owner=isOwnershipContract(row),minutes=Number(row.overdue_minutes),days=Math.floor(minutes/1440);
  if(bucket.startsWith('ownership-')!==owner)return false;
  if(bucket.endsWith('-bad-debt'))return row.status==='bad_debt';
  if(row.status==='bad_debt'||row.status!=='overdue'&&row.collection_overdue!==1)return false;
  if(bucket.endsWith('-overdue'))return true;
  if(!Number.isFinite(minutes))return false;
  switch(bucket){
    case 'traditional-3':return minutes>3*1440;
    case 'traditional-10':return minutes>10*1440;
    case 'ownership-1-5':return days>=1&&days<=5;
    case 'ownership-6-15':return days>=6&&days<=15;
    case 'ownership-15-plus':return days>15;
    default:return false;
  }
}

interface OverdueItem {return_at?:unknown;completed_at?:unknown;daily_price?:unknown;legacy_fee_policy?:boolean;legacy_daily_price?:number|null;legacy_hourly_rate?:number|null;legacy_fixed_total?:boolean}
function itemsFrom(value:unknown):OverdueItem[]|undefined {
  if(typeof value!=='string'||!value)return;
  try {const items=JSON.parse(value);return Array.isArray(items)?items.filter(item=>item&&typeof item==='object'):undefined;}catch{return;}
}
/** Read-only estimate for vehicles still on hire. It never changes contract totals or receipts. */
export function withContractOverdue(row:ManagementRow,now=Date.now()):ManagementRow {
  const clock=badDebtClock(row.status,row.bad_debt_at,now);
  const saved=itemsFrom(row.overdue_items_json);
  const vehicles=itemsFrom(row.vehicles_json);
  const dated=vehicles?.filter(item=>item.return_at);
  const items=saved??(dated?.length?dated:[{return_at:row.end_date}]);
  let minutes:number|undefined,fee=0,unknownFee=false;
  for(const item of items){
    if(item.completed_at)continue;
    const due=Date.parse(String(item.return_at||''));
    if(!Number.isFinite(due)){unknownFee=true;continue;}
    if(clock===undefined){unknownFee=true;continue;}
    const elapsed=Math.max(clock-due,0);
    minutes=Math.max(minutes??0,Math.floor(elapsed/60000));
    if(!elapsed)continue;
    if(usesLegacyOwnershipFees(row)&&!item.legacy_fee_policy){unknownFee=true;continue;}
    const price=Number(item.daily_price);
    const estimate=usesLegacyOwnershipFees(row)&&item.legacy_fee_policy
      ?legacyOwnershipLateFee(Math.floor(elapsed/60000),item.legacy_daily_price??null,item.legacy_hourly_rate??null,item.legacy_fixed_total)
      :lateReturnFee(Math.ceil(elapsed/60000),DEFAULT_LATE_HOURLY_RATE,Number.isSafeInteger(price)&&price>0?price:null);
    if(estimate.amount===null)unknownFee=true;else fee+=estimate.amount;
  }
  const total=row.total_amount,paid=row.paid_amount;
  return {...row,overdue_minutes:minutes,overdue_days:minutes===undefined?0:Math.floor(minutes/1440),
    overdue_fee_estimate:minutes===undefined||unknownFee?undefined:fee,
    rental_debt_amount:total===undefined||total===''||paid===undefined||paid===''?undefined:Math.max(Number(total)-Number(paid),0)};
}

/** Ownership collections follow unpaid installments; older contracts retain the vehicle deadline. */
export function withContractMonitoring(row:ManagementRow,now=Date.now()):ManagementRow {
  const base=withContractOverdue(row,now);
  if(row.status==='bad_debt')return {...base,contract_signed_at:row.signed_on||row.start_date,overdue_basis:'return',collection_overdue:0,monitoring_amount:base.rental_debt_amount};
  const owner=isOwnershipContract(row);
  if(!owner||!row.billing_plan_json)return {...base,contract_signed_at:row.signed_on||row.start_date,overdue_basis:'return',collection_overdue:row.status==='overdue'?1:0,monitoring_amount:owner&&!usesLegacyOwnershipFees(row)?base.rental_debt_amount:base.overdue_fee_estimate};
  if(row.billing_error||row.billing_due_amount===undefined||row.billing_due_amount==='')return {...base,contract_signed_at:row.signed_on||row.start_date,overdue_basis:'payment',overdue_minutes:undefined,overdue_days:0,overdue_fee_estimate:undefined,collection_overdue:row.status==='overdue'?1:0,monitoring_amount:undefined};
  const due=String(row.billing_overdue_at||'');
  const dueAt=Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(due)?`${due}:00+07:00`:due);
  const active=['renting','overdue','wait_payment','bad_debt'].includes(row.status);
  const late=active&&Number(row.billing_due_amount)>0&&Number.isFinite(dueAt)&&dueAt<=now;
  const minutes=late?Math.max(0,Math.floor((now-dueAt)/60000)):undefined;
  return {...base,status:late&&row.status==='renting'?'overdue':!late&&row.status==='overdue'?'renting':row.status,
    contract_signed_at:row.signed_on||row.start_date,overdue_basis:'payment',overdue_minutes:minutes,overdue_days:minutes===undefined?0:Math.floor(minutes/1440),overdue_fee_estimate:undefined,collection_overdue:late?1:0,monitoring_amount:row.billing_due_amount};
}
