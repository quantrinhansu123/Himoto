import type {MobileWriteReceipt} from './mobile-contract';

export interface MobileSwapLine {
  id:number;vehicleId:number;revision:string;name:string;license:string;startsAt:string|null;returnAt:string|null;
  completedAt:string|null;available:boolean;blockedReason:string|null;
}
export interface MobileSwapPreparation {
  id:number;code:string;status:string;storeId:number;revision:string;ownership:boolean;available:boolean;blockedReason:string|null;
  items:{page:number;pages:number;total:number;rows:MobileSwapLine[]};observedAt:string;
}
export interface MobileSwapVehicle {
  id:number;revision:string;name:string;license:string;brand:string;type:string;color:string;year:string;storeId:number;storeName:string;
}
export interface MobileSwapCandidates {
  id:number;revision:string;itemId:number;itemRevision:string;ownership:boolean;page:number;search:string;hasMore:boolean;
  rows:MobileSwapVehicle[];observedAt:string;
}
export interface MobileSwapInput {revision:string;item_id:number;item_revision:string;vehicle_id:number;vehicle_revision:string}
export interface MobileSwapPreview {
  id:number;code:string;revision:string;ownership:boolean;item:MobileSwapLine;vehicle:MobileSwapVehicle;observedAt:string;
}
export interface MobileSwapReceipt extends MobileWriteReceipt {
  requestId:string;code:string;swapId:number;swapRevision:string;itemId:number;itemRevision:string;
  reviewedRevision:string;reviewedItemRevision:string;reviewedVehicleRevision:string;
  from:{id:number;name:string;license:string};to:MobileSwapVehicle;recordedAt:string;
  itemCurrent:boolean;historyCurrent:boolean;vehicleCurrent:boolean;contractCurrent:boolean;current:boolean;
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const text=(v:unknown):v is string=>typeof v==='string'&&v.length<=4000;
const revision=(v:unknown)=>typeof v==='string'&&/^[1-9]\d{0,19}$/.test(v);
const time=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&v.length<=40&&Number.isFinite(Date.parse(v));
const gate=(v:Record<string,unknown>)=>typeof v.available==='boolean'&&(v.blockedReason===null||text(v.blockedReason)&&v.blockedReason.length>0)&&v.available===(v.blockedReason===null);
function line(v:unknown):v is MobileSwapLine {
  return object(v)&&positive(v.id)&&positive(v.vehicleId)&&revision(v.revision)&&text(v.name)&&text(v.license)&&
    [v.startsAt,v.returnAt,v.completedAt].every(at=>at===null||time(at))&&gate(v)&&(!v.available||v.completedAt===null);
}
export function isMobileSwapPreparation(v:unknown):v is MobileSwapPreparation {
  if(!object(v)||!positive(v.id)||!text(v.code)||!text(v.status)||!positive(v.storeId)||!revision(v.revision)||typeof v.ownership!=='boolean'||!gate(v)||!time(v.observedAt))return false;
  if(v.available&&!['renting','overdue','wait_payment'].includes(v.status))return false;
  const items=v.items;
  return object(items)&&positive(items.page)&&positive(items.pages)&&typeof items.total==='number'&&Number.isSafeInteger(items.total)&&items.total>=0&&items.total<=1000000&&
    items.pages===Math.max(1,Math.ceil(items.total/25))&&items.page<=items.pages&&Array.isArray(items.rows)&&
    items.rows.length===Math.max(0,Math.min(25,items.total-(items.page-1)*25))&&items.rows.every(row=>line(row)&&(!row.available||v.available))&&
    new Set(items.rows.map(row=>row.id)).size===items.rows.length&&(!v.available||items.total>0);
}
export function isMobileSwapVehicle(v:unknown):v is MobileSwapVehicle {
  return object(v)&&positive(v.id)&&revision(v.revision)&&positive(v.storeId)&&
    [v.name,v.license,v.brand,v.type,v.color,v.year,v.storeName].every(text);
}
export function isMobileSwapCandidates(v:unknown):v is MobileSwapCandidates {
  return object(v)&&positive(v.id)&&revision(v.revision)&&positive(v.itemId)&&revision(v.itemRevision)&&typeof v.ownership==='boolean'&&
    positive(v.page)&&v.page<=10000&&text(v.search)&&v.search.length<=120&&typeof v.hasMore==='boolean'&&time(v.observedAt)&&
    Array.isArray(v.rows)&&v.rows.length<=25&&(!v.hasMore||v.rows.length===25)&&v.rows.every(isMobileSwapVehicle)&&new Set(v.rows.map(row=>row.id)).size===v.rows.length;
}
export function isMobileSwapPreview(v:unknown):v is MobileSwapPreview {
  return object(v)&&positive(v.id)&&text(v.code)&&revision(v.revision)&&typeof v.ownership==='boolean'&&
    line(v.item)&&v.item.available&&isMobileSwapVehicle(v.vehicle)&&v.vehicle.id!==v.item.vehicleId&&time(v.observedAt);
}
export function matchesSwapPreview(value:MobileSwapPreview,input:MobileSwapInput) {
  return value.revision===input.revision&&value.item.id===input.item_id&&value.item.revision===input.item_revision&&
    value.vehicle.id===input.vehicle_id&&value.vehicle.revision===input.vehicle_revision;
}
export function isMobileSwapReceipt(v:unknown):v is MobileSwapReceipt {
  if(!object(v)||!positive(v.id)||!revision(v.revision)||typeof v.replayed!=='boolean'||!text(v.code)||!positive(v.swapId)||!revision(v.swapRevision)||
    typeof v.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.requestId)||
    !positive(v.itemId)||!revision(v.itemRevision)||!revision(v.reviewedRevision)||!revision(v.reviewedItemRevision)||!revision(v.reviewedVehicleRevision)||
    !object(v.from)||!positive(v.from.id)||!text(v.from.name)||!text(v.from.license)||
    !isMobileSwapVehicle(v.to)||v.to.id===v.from.id||!time(v.recordedAt)||![v.itemCurrent,v.historyCurrent,v.vehicleCurrent,v.contractCurrent,v.current].every(x=>typeof x==='boolean'))return false;
  return v.current===(v.itemCurrent&&v.historyCurrent&&v.vehicleCurrent&&v.contractCurrent);
}
