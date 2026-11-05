import type {MobileWriteReceipt} from './mobile-contract';
export const vehicleTransferActions=['transfer','receive','reject','cancel'] as const;
export type MobileVehicleTransferAction=typeof vehicleTransferActions[number];
export interface MobileTransferStore {id:number;name:string;revision:string}
export interface MobileTransferVehicle {
  id:number;revision:string;name:string;license:string;brand:string;type:string;color:string;year:string;status:string;storeId:number|null;storeName:string;
  // Absent only in original receipts recorded before ownership was projected.
  ownerStoreId?:number|null;ownerStoreName?:string;
}
export interface MobilePendingTransfer {
  id:number;revision:string;type:string;fromStoreId:number|null;toStoreId:number|null;fromStoreName:string;toStoreName:string;
  actorId:number|null;recordedAt:string|null;receivable:boolean;
}
export interface MobileVehicleTransferPreparation {
  id:number;vehicle:MobileTransferVehicle;transfer:MobilePendingTransfer|null;
  actions:{action:MobileVehicleTransferAction;available:boolean;blockedReason:string|null}[];observedAt:string;
}
export interface MobileTransferDestinations {
  id:number;revision:string;page:number;search:string;hasMore:boolean;rows:MobileTransferStore[];observedAt:string;
}
export type MobileVehicleTransferInput={revision:string;note:string}&(
  {action:'transfer';to_store_id:number}|{action:'receive'|'reject'|'cancel';transfer_event_id:number;transfer_event_revision:string}
);
export interface MobileVehicleTransferPreview {
  id:number;action:MobileVehicleTransferAction;revision:string;snapshot:string;vehicle:MobileTransferVehicle;
  transfer:MobilePendingTransfer|null;fromStore:MobileTransferStore|null;toStore:MobileTransferStore;
  after:{status:string;storeId:number;ownerStoreId?:number};effect:'awaiting_receipt'|'immediate_transfer'|'received'|'rejected'|'cancelled';note:string;observedAt:string;
}
export type MobileVehicleTransferRecordInput=MobileVehicleTransferInput&{review_snapshot:string};
export interface MobileTransferEventProof {
  id:number;revision:string;type:string;refId:number|null;fromStoreId:number|null;toStoreId:number|null;
  fromStoreName:string;toStoreName:string;actorId:number;actorName:string;recordedAt:string;note:string;
}
export interface MobileVehicleTransferReceipt extends MobileWriteReceipt {
  requestId:string;action:MobileVehicleTransferAction;review:MobileVehicleTransferPreview;events:MobileTransferEventProof[];
  recordedAt:string;vehicleCurrent:boolean;eventsCurrent:boolean;transferCurrent:boolean;current:boolean;
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const nullableId=(v:unknown)=>v===null||positive(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.length<=4000;
const revision=(v:unknown)=>typeof v==='string'&&/^[1-9]\d{0,19}$/.test(v);
const time=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&v.length<=40&&Number.isFinite(Date.parse(v));
const action=(v:unknown):v is MobileVehicleTransferAction=>vehicleTransferActions.some(a=>a===v);
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function isMobileTransferStore(v:unknown):v is MobileTransferStore {return object(v)&&positive(v.id)&&text(v.name)&&revision(v.revision);}
export function isMobileTransferVehicle(v:unknown):v is MobileTransferVehicle {
  return object(v)&&positive(v.id)&&revision(v.revision)&&nullableId(v.storeId)&&[v.name,v.license,v.brand,v.type,v.color,v.year,v.status,v.storeName].every(text)&&
    (!('ownerStoreId' in v)&&!('ownerStoreName' in v)||nullableId(v.ownerStoreId)&&text(v.ownerStoreName));
}
export function isMobilePendingTransfer(v:unknown):v is MobilePendingTransfer {
  return object(v)&&positive(v.id)&&revision(v.revision)&&['manual_transfer','transfer_dispatch'].includes(String(v.type))&&
    nullableId(v.fromStoreId)&&nullableId(v.toStoreId)&&nullableId(v.actorId)&&text(v.fromStoreName)&&text(v.toStoreName)&&
    (v.recordedAt===null||time(v.recordedAt))&&typeof v.receivable==='boolean'&&(!v.receivable||v.type==='manual_transfer');
}
export function isMobileVehicleTransferPreparation(v:unknown):v is MobileVehicleTransferPreparation {
  return object(v)&&positive(v.id)&&isMobileTransferVehicle(v.vehicle)&&v.vehicle.id===v.id&&
    (v.transfer===null||isMobilePendingTransfer(v.transfer))&&time(v.observedAt)&&Array.isArray(v.actions)&&v.actions.length===4&&
    v.actions.every(a=>object(a)&&action(a.action)&&typeof a.available==='boolean'&&(a.blockedReason===null||text(a.blockedReason)&&a.blockedReason.length>0)&&
      a.available===(a.blockedReason===null))&&new Set(v.actions.map(a=>a.action)).size===4&&(v.vehicle.status==='in_transit'||v.transfer===null);
}
export function isMobileTransferDestinations(v:unknown):v is MobileTransferDestinations {
  return object(v)&&positive(v.id)&&revision(v.revision)&&positive(v.page)&&v.page<=10000&&text(v.search)&&v.search.length<=120&&
    typeof v.hasMore==='boolean'&&Array.isArray(v.rows)&&v.rows.length<=25&&(!v.hasMore||v.rows.length===25)&&v.rows.every(isMobileTransferStore)&&
    new Set(v.rows.map(row=>row.id)).size===v.rows.length&&time(v.observedAt);
}
export function isMobileVehicleTransferPreview(v:unknown):v is MobileVehicleTransferPreview {
  if(!object(v)||!positive(v.id)||!action(v.action)||!revision(v.revision)||!hash(v.snapshot)||!isMobileTransferVehicle(v.vehicle)||
    v.vehicle.id!==v.id||v.vehicle.revision!==v.revision||!(v.transfer===null||isMobilePendingTransfer(v.transfer))||
    !(v.fromStore===null||isMobileTransferStore(v.fromStore))||!isMobileTransferStore(v.toStore)||!object(v.after)||
    !text(v.after.status)||!positive(v.after.storeId)||!text(v.note)||v.note.length>500||v.note!==v.note.trim()||!time(v.observedAt))return false;
  // Accept complete historical proof without assigning today's ownership rules
  // to it. New proof must describe both sides, including an unknown old owner.
  if(v.vehicle.ownerStoreId===undefined?'ownerStoreId' in v.after:!positive(v.after.ownerStoreId)||v.after.ownerStoreId!==v.after.storeId)return false;
  if(v.action==='transfer')return v.vehicle.status!=='sold'&&v.vehicle.status!=='in_transit'&&v.transfer===null&&v.toStore.id!==v.vehicle.storeId&&
    v.after.storeId===v.toStore.id&&(v.vehicle.status==='ready'?v.effect==='awaiting_receipt'&&v.after.status==='in_transit':v.effect==='immediate_transfer'&&v.after.status===v.vehicle.status);
  return v.vehicle.status==='in_transit'&&v.transfer!==null&&v.transfer.receivable&&v.transfer.toStoreId===v.vehicle.storeId&&v.after.status==='ready'&&
    v.effect===({receive:'received',reject:'rejected',cancel:'cancelled'} as const)[v.action]&&
    (v.action==='receive'?v.after.storeId===v.transfer.toStoreId:v.fromStore!==null&&v.after.storeId===v.transfer.fromStoreId)&&v.toStore.id===v.transfer.toStoreId;
}
export function matchesVehicleTransferPreview(v:MobileVehicleTransferPreview,input:MobileVehicleTransferInput) {
  return v.action===input.action&&v.revision===input.revision&&v.note===input.note.trim()&&
    (input.action==='transfer'?v.toStore.id===input.to_store_id:v.transfer?.id===input.transfer_event_id&&v.transfer.revision===input.transfer_event_revision);
}
export function isMobileTransferEventProof(v:unknown):v is MobileTransferEventProof {
  return object(v)&&positive(v.id)&&revision(v.revision)&&['manual_transfer','manual_transfer_receive','manual_transfer_reject','manual_transfer_cancel'].includes(String(v.type))&&
    nullableId(v.refId)&&nullableId(v.fromStoreId)&&nullableId(v.toStoreId)&&positive(v.actorId)&&[v.fromStoreName,v.toStoreName,v.actorName,v.note].every(text)&&time(v.recordedAt);
}
export function isMobileVehicleTransferReceipt(v:unknown):v is MobileVehicleTransferReceipt {
  if(!object(v)||!positive(v.id)||!revision(v.revision)||typeof v.replayed!=='boolean'||!action(v.action)||!isMobileVehicleTransferPreview(v.review)||
    v.review.id!==v.id||v.review.action!==v.action||typeof v.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.requestId)||
    !Array.isArray(v.events)||!v.events.every(isMobileTransferEventProof)||!time(v.recordedAt)||![v.vehicleCurrent,v.eventsCurrent,v.transferCurrent,v.current].every(x=>typeof x==='boolean'))return false;
  const events=v.events as MobileTransferEventProof[],first=events[0],last=events.at(-1);
  if(!first||!last||v.recordedAt!==last.recordedAt||new Set(events.map(e=>e.id)).size!==events.length||events.some(e=>e.actorId!==first.actorId)||
    v.current!==(v.vehicleCurrent&&v.eventsCurrent&&v.transferCurrent))return false;
  if(v.action==='transfer')return first.type==='manual_transfer'&&first.refId===null&&first.toStoreId===v.review.toStore.id&&first.fromStoreId===v.review.vehicle.storeId&&
    (v.review.effect==='awaiting_receipt'?events.length===1:events.length===2&&last.type==='manual_transfer_receive'&&last.refId===first.id&&last.toStoreId===first.toStoreId&&last.fromStoreId===first.fromStoreId);
  return events.length===1&&first.type===({receive:'manual_transfer_receive',reject:'manual_transfer_reject',cancel:'manual_transfer_cancel'} as const)[v.action]&&
    first.refId===v.review.transfer?.id&&first.fromStoreId===v.review.transfer.fromStoreId&&first.toStoreId===v.review.transfer.toStoreId;
}
