import type {MobileWriteReceipt} from './mobile-contract';
import {isMobileTransferVehicle,isMobileTransferStore,type MobileTransferVehicle,type MobileTransferStore} from './mobile-vehicle-transfers';

export const VEHICLE_INVENTORY_STATUSES = [
  {value:'ready',label:'Lưu kho'}, {value:'using',label:'Đang thuê'}, {value:'repairing',label:'Bảo dưỡng'},
  {value:'pending',label:'Đặt trước'}, {value:'sold',label:'Đã bán'}, {value:'bad_debt',label:'Nợ xấu'}, {value:'broken',label:'Hỏng'},
] as const;
export interface MobileInventoryStatusInput {
  action:'inventory_status';revision:string;status:typeof VEHICLE_INVENTORY_STATUSES[number]['value'];note:string;
}
export interface MobileLegacyVehicleStatusInput {
  action:'status';revision:string;status:'ready'|'using';beneficiary_store_id:number;
  customer_name:string;customer_phone:string;customer_id_card:string;note:string;
}
export type MobileVehicleStatusInput = MobileLegacyVehicleStatusInput | MobileInventoryStatusInput;
export interface MobileVehicleStatusPreparation {
  id:number;vehicle:MobileTransferVehicle;stores:MobileTransferStore[];available:boolean;blockedReason:string|null;
  defaults:{status:''|'ready'|'using';storeId:number|null};actor:{id:number;name:string};observedAt:string;
  inventory?:{available:boolean;blockedReason:string|null;status:string;hasOpenContract:boolean};
}
export interface MobileVehicleStatusReview {
  id:number;vehicle:MobileTransferVehicle;input:MobileVehicleStatusInput;store:MobileTransferStore;
  customer:{id:number;name:string;matchedBy:string}|null;actor:{id:number;name:string};
  effect:'draft'|'ready'|'inventory';snapshot:string;observedAt:string;
}
export interface MobileVehicleStatusReceipt extends MobileWriteReceipt {
  requestId:string;review:MobileVehicleStatusReview;eventId:number;actorId:number;actorName:string;recordedAt:string;
  customer:{id:number;name:string;created:boolean;matched_by:string}|null;draft:{id:number;code:string}|null;
  vehicleCurrent:boolean;eventCurrent:boolean;draftCurrent:boolean;current:boolean;
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=999999999999999;
const text=(v:unknown):v is string=>typeof v==='string'&&v.length<=4000;
const rev=(v:unknown)=>typeof v==='string'&&/^[1-9]\d{0,19}$/.test(v);
const time=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)&&v.length<=40&&Number.isFinite(Date.parse(v));
const actor=(v:unknown)=>object(v)&&id(v.id)&&text(v.name);
export function isMobileVehicleStatusInput(v:unknown):v is MobileVehicleStatusInput {
  if(object(v)&&v.action==='inventory_status')return Object.keys(v).length===4&&rev(v.revision)&&VEHICLE_INVENTORY_STATUSES.some(row=>row.value===v.status)&&text(v.note)&&v.note.length<=500&&v.note===v.note.trim();
  return object(v)&&v.action==='status'&&rev(v.revision)&&['ready','using'].includes(String(v.status))&&id(v.beneficiary_store_id)&&
    text(v.customer_name)&&v.customer_name.length<=191&&v.customer_name===v.customer_name.trim()&&text(v.customer_phone)&&
    (v.customer_phone===''||/^\+?\d{8,15}$/.test(v.customer_phone))&&text(v.customer_id_card)&&
    (v.customer_id_card===''||/^(?:\d{9}|\d{12})$/.test(v.customer_id_card))&&text(v.note)&&v.note.length<=500&&v.note===v.note.trim()&&
    (v.status==='ready'||!!v.customer_name&&!!v.customer_phone&&!!v.customer_id_card);
}
export function isMobileVehicleStatusPreparation(v:unknown):v is MobileVehicleStatusPreparation {
  return object(v)&&id(v.id)&&isMobileTransferVehicle(v.vehicle)&&v.vehicle.id===v.id&&Array.isArray(v.stores)&&
    v.stores.every(isMobileTransferStore)&&new Set(v.stores.map(s=>s.id)).size===v.stores.length&&typeof v.available==='boolean'&&
    (v.blockedReason===null||text(v.blockedReason)&&!!v.blockedReason)&&v.available===(v.blockedReason===null)&&object(v.defaults)&&
    v.defaults.status===(['ready','using'].includes(v.vehicle.status)?v.vehicle.status:v.vehicle.status==='rent'?'using':'')&&
    v.defaults.storeId===v.vehicle.storeId&&actor(v.actor)&&time(v.observedAt)&&
    (v.inventory===undefined||object(v.inventory)&&typeof v.inventory.available==='boolean'&&typeof v.inventory.hasOpenContract==='boolean'&&text(v.inventory.status)&&
      (v.inventory.blockedReason===null||text(v.inventory.blockedReason)&&!!v.inventory.blockedReason)&&v.inventory.available===(v.inventory.blockedReason===null));
}
export function isMobileVehicleStatusReview(v:unknown):v is MobileVehicleStatusReview {
  return object(v)&&id(v.id)&&isMobileTransferVehicle(v.vehicle)&&v.vehicle.id===v.id&&isMobileVehicleStatusInput(v.input)&&
    v.input.revision===v.vehicle.revision&&isMobileTransferStore(v.store)&&v.store.id===(v.input.action==='inventory_status'?v.vehicle.storeId:v.input.beneficiary_store_id)&&
    (v.customer===null||object(v.customer)&&id(v.customer.id)&&text(v.customer.name)&&text(v.customer.matchedBy))&&actor(v.actor)&&
    (v.input.action==='inventory_status'?v.effect==='inventory'&&v.customer===null&&v.vehicle.status!=='in_transit':v.effect===(v.input.status==='using'?'draft':'ready')&&(v.effect==='draft'?v.vehicle.status==='ready':v.customer===null&&!['ready','in_transit'].includes(v.vehicle.status)))&&
    typeof v.snapshot==='string'&&/^[a-f0-9]{64}$/.test(v.snapshot)&&time(v.observedAt);
}
export function matchesVehicleStatusReview(review:MobileVehicleStatusReview,input:MobileVehicleStatusInput) {
  if(input.action==='inventory_status')return review.input.action===input.action&&review.input.revision===input.revision&&review.input.status===input.status&&review.input.note===input.note.trim();
  const normalized={...input,customer_name:input.customer_name.trim(),customer_phone:input.customer_phone.trim().replace(/[\s.-]/g,''),customer_id_card:input.customer_id_card.trim().replace(/\s/g,''),note:input.note.trim()};
  return review.input.action==='status'&&Object.entries(normalized).every(([key,value])=>(review.input as unknown as Record<string,unknown>)[key]===value);
}
export function isMobileVehicleStatusReceipt(v:unknown):v is MobileVehicleStatusReceipt {
  if(!object(v)||!id(v.id)||!rev(v.revision)||typeof v.replayed!=='boolean'||typeof v.requestId!=='string'||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v.requestId)||
    !isMobileVehicleStatusReview(v.review)||v.review.id!==v.id||!id(v.eventId)||v.actorId!==v.review.actor.id||v.actorName!==v.review.actor.name||!time(v.recordedAt)||
    !['vehicleCurrent','eventCurrent','draftCurrent','current'].every(k=>typeof v[k]==='boolean')||v.current!==(v.vehicleCurrent&&v.eventCurrent&&v.draftCurrent))return false;
  if(v.review.effect==='ready'||v.review.effect==='inventory')return v.customer===null&&v.draft===null&&v.draftCurrent===true;
  if(v.review.input.action!=='status')return false;
  return object(v.customer)&&id(v.customer.id)&&text(v.customer.name)&&typeof v.customer.created==='boolean'&&text(v.customer.matched_by)&&
    (v.review.customer===null?v.customer.created===true&&v.customer.name===v.review.input.customer_name:v.customer.created===false&&v.customer.id===v.review.customer.id&&v.customer.name===v.review.customer.name&&v.customer.matched_by===v.review.customer.matchedBy)&&
    object(v.draft)&&id(v.draft.id)&&text(v.draft.code)&&!!v.draft.code;
}
