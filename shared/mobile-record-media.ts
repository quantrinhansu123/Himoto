import type {MobileWriteReceipt} from './mobile-contract';
export type MobileMediaEntity='contracts'|'vehicles'|'customers';
export type MobileMediaKind='return'|'swap'|'transfer'|'receive'|'customer'|'rental'|'plate'|'vehicle'|'renewal'|'renewal_receipt'|'battery_swap';
export interface MobileMediaIdentity {entity:MobileMediaEntity;id:number;kind:MobileMediaKind;referenceId:number}
export interface MobileMediaTarget extends MobileMediaIdentity {revision:string;referenceRevision:string;label:string;snapshot?:string;canWrite?:boolean}
export interface MobileMediaSlot {slot:string;label:string;kind:'image'|'video'}
export interface MobileMediaPhoto {
  slot:string;label:string;revision:string;mimeType:string;bytes:number|null;updatedAt:string;
  kind:'image'|'video'|'unknown';readable:boolean;blockedReason:string|null;
}
export interface MobileRecordMedia {
  target:MobileMediaTarget;slots:MobileMediaSlot[];page:number;hasMore:boolean;rows:MobileMediaPhoto[];observedAt:string;
}
export interface MobileMediaSlotInfo {target:MobileMediaTarget;slot:string;label:string;photo:MobileMediaPhoto|null;nextSlot:string|null;observedAt:string}
export interface MobileMediaTargets {entity:MobileMediaEntity;id:number;page:number;hasMore:boolean;rows:MobileMediaTarget[];observedAt:string}
export interface MobileMediaReceipt extends MobileWriteReceipt {
  requestId:string;target:MobileMediaTarget;slot:string;label:string;photoRevision:string;sha256:string;bytes:number;
  actorId:number;actorName:string;recordedAt:string;parentCurrent:boolean;referenceCurrent:boolean;photoCurrent:boolean;current:boolean;
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=999999999999999;
const text=(v:unknown):v is string=>typeof v==='string'&&v.length<=4000;
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function isMobileMediaTarget(v:unknown):v is MobileMediaTarget {
  return isMobileMediaIdentity(v)&&isMediaRevision((v as MobileMediaTarget).revision)&&isMediaRevision((v as MobileMediaTarget).referenceRevision)&&text((v as MobileMediaTarget).label)&&hash((v as MobileMediaTarget).snapshot)&&
    (v.entity!=='customers'||typeof (v as MobileMediaTarget).canWrite==='boolean');
}
export function isMobileMediaTargets(v:unknown):v is MobileMediaTargets {
  return object(v)&&['contracts','vehicles','customers'].includes(String(v.entity))&&id(v.id)&&id(v.page)&&v.page<=10000&&typeof v.hasMore==='boolean'&&Array.isArray(v.rows)&&
    v.rows.length<=25&&(!v.hasMore||v.rows.length===25)&&v.rows.every(r=>isMobileMediaTarget(r)&&r.entity===v.entity&&r.id===v.id)&&
    new Set(v.rows.map(r=>r.kind+':'+r.referenceId)).size===v.rows.length&&typeof v.observedAt==='string'&&Number.isFinite(Date.parse(v.observedAt));
}
export const isMediaRevision=(v:unknown):v is string=>typeof v==='string'&&/^[1-9]\d{0,19}$/.test(v);
export function isMobileMediaIdentity(v:unknown):v is MobileMediaIdentity {
  return object(v)&&id(v.id)&&id(v.referenceId)&&
    (v.entity==='customers'?v.kind==='customer'&&v.referenceId===v.id:
      v.entity==='contracts'?v.kind==='return'||v.kind==='swap'||v.kind==='renewal'||v.kind==='renewal_receipt'||v.kind==='battery_swap'||v.kind==='rental'&&v.referenceId===v.id||v.kind==='plate':v.entity==='vehicles'&&(v.kind==='transfer'||v.kind==='receive'||v.kind==='vehicle'&&v.referenceId===v.id));
}
export function mediaSlotPattern(target:MobileMediaIdentity) {
  const suffix='(?:-extra-([2-9]|[1-9][0-9]{1,14}))?';
  if(target.entity==='customers')return `^(?:id_front|id_back|driver_license)${suffix}$`;
  if(target.entity==='vehicles'&&target.kind==='vehicle')return `^(?:vehicle-photo|registration-front|registration-back|purchase-document-[12])${suffix}$`;
  if(target.kind==='rental')return `^(?:(?:customer-id-front|customer-id-back|customer-driver-license|driver-license|rental-(?:[1-9][0-9]{0,14}|document-[1-9][0-9]{0,14}|signed-[1-9][0-9]{0,14})|handover-(?:[1-9][0-9]{0,14}|document-[1-9][0-9]{0,14}))${suffix}|(?:rental|handover)-video-[1-3])$`;
  if(target.kind==='plate')return `^plate-${target.referenceId}${suffix}$`;
  if(target.kind==='renewal'||target.kind==='renewal_receipt')return `^${target.kind==='renewal'?'renewal':'renewal-receipt'}-${target.referenceId}-(?:(?:[1-9][0-9]{0,14}|document-[1-9][0-9]{0,14})${suffix}|video-[1-3])$`;
  if(target.kind==='battery_swap')return `^battery-swap-${target.referenceId}-(?:(?:[12]|document-[1-9][0-9]{0,14})${suffix}|video-1)$`;
  const prefix=target.kind==='swap'?'vehicle-swap':target.kind;
  // Supplemental video slots are deliberately excluded, matching photoBaseSlot.
  return target.kind==='return'?`^return-${target.referenceId}-(?:([1-9][0-9]{0,14}|document-[1-9][0-9]{0,14})${suffix}|video-[1-3])$`:
    `^${prefix}-${target.referenceId}-${target.kind==='swap'?'[1-9][0-9]{0,14}':'1'}${suffix}$`;
}
export function isMobileMediaSlot(target:MobileMediaIdentity,slot:unknown):slot is string {
  return isMobileMediaIdentity(target)&&typeof slot==='string'&&slot.length<=120&&new RegExp(mediaSlotPattern(target)).test(slot);
}
export function matchesMobileMediaTarget(target:MobileMediaIdentity,expected:MobileMediaIdentity) {
  return ['entity','id','kind','referenceId'].every(key=>target[key as keyof MobileMediaIdentity]===expected[key as keyof MobileMediaIdentity]);
}
export function isMobileMediaPhoto(v:unknown,target:MobileMediaIdentity):v is MobileMediaPhoto {
  if(!object(v)||!isMobileMediaSlot(target,v.slot)||!text(v.label)||!isMediaRevision(v.revision)||!text(v.mimeType)||v.mimeType.length>120||
    !(v.bytes===null||typeof v.bytes==='number'&&Number.isSafeInteger(v.bytes)&&v.bytes>=0)||typeof v.updatedAt!=='string'||!Number.isFinite(Date.parse(v.updatedAt))||
    typeof v.readable!=='boolean'||!(v.blockedReason===null||text(v.blockedReason)&&v.blockedReason.length>0)||v.readable!==(v.blockedReason===null))return false;
  const kind=['image/jpeg','image/png','image/webp'].includes(v.mimeType)?'image':v.mimeType.startsWith('video/')?'video':'unknown';
  return v.kind===kind&&(!v.readable||kind==='image'&&!/-video-[1-3]$/.test(v.slot)&&(v.bytes===null||v.bytes>0&&v.bytes<=2*1024*1024)||kind==='video'&&v.mimeType==='video/mp4'&&/-video-[1-3]$/.test(v.slot)&&(v.bytes===null||v.bytes>0&&v.bytes<=45*1024*1024));
}
export function isMobileRecordMedia(v:unknown):v is MobileRecordMedia {
  if(!object(v)||!isMobileMediaTarget(v.target)||!isMediaRevision((v.target as MobileMediaTarget).revision)||!isMediaRevision((v.target as MobileMediaTarget).referenceRevision)||
    !text((v.target as MobileMediaTarget).label)||!hash((v.target as MobileMediaTarget).snapshot)||!id(v.page)||v.page>10000||typeof v.hasMore!=='boolean'||!Array.isArray(v.rows)||v.rows.length>25||v.hasMore&&v.rows.length!==25||
    !Array.isArray(v.slots)||v.slots.length>100||typeof v.observedAt!=='string'||!Number.isFinite(Date.parse(v.observedAt)))return false;
  const target=v.target;
  return v.rows.every(row=>isMobileMediaPhoto(row,target))&&new Set(v.rows.map(row=>row.slot)).size===v.rows.length&&
    v.slots.every(slot=>object(slot)&&isMobileMediaSlot(target,slot.slot)&&text(slot.label)&&slot.kind===(/-video-[1-3]$/.test(slot.slot)?'video':'image'))&&
    new Set(v.slots.map(slot=>slot.slot)).size===v.slots.length;
}
export function isMobileMediaSlotInfo(v:unknown):v is MobileMediaSlotInfo {
  return object(v)&&isMobileMediaTarget(v.target)&&isMediaRevision((v.target as MobileMediaTarget).revision)&&isMediaRevision((v.target as MobileMediaTarget).referenceRevision)&&
    text((v.target as MobileMediaTarget).label)&&hash((v.target as MobileMediaTarget).snapshot)&&isMobileMediaSlot(v.target,v.slot)&&text(v.label)&&
    (v.photo===null||isMobileMediaPhoto(v.photo,v.target)&&v.photo.slot===v.slot)&&
    (v.nextSlot===null||isMobileMediaSlot(v.target,v.nextSlot)&&v.nextSlot!==v.slot)&&typeof v.observedAt==='string'&&Number.isFinite(Date.parse(v.observedAt));
}
export const mediaOperation=(entity:MobileMediaEntity,id:number)=>`media.${entity==='customers'?'customer':entity==='contracts'?'contract':'vehicle'}:${id}`;
export function isMobileMediaReceipt(v:unknown):v is MobileMediaReceipt {
  if(!object(v)||!isMobileMediaIdentity(v.target)||(v.target.entity==='customers'&&typeof (v.target as MobileMediaTarget).canWrite!=='boolean')||v.id!==v.target.id||!isMediaRevision(v.revision)||!isMediaRevision((v.target as MobileMediaTarget).revision)||
    v.revision!==(v.target as MobileMediaTarget).revision||!isMediaRevision((v.target as MobileMediaTarget).referenceRevision)||!text((v.target as MobileMediaTarget).label)||
    ((v.target as MobileMediaTarget).snapshot!==undefined&&!hash((v.target as MobileMediaTarget).snapshot))||
    !isMobileMediaSlot(v.target,v.slot)||/-video-[1-3]$/.test(v.slot)||!text(v.label)||!isMediaRevision(v.photoRevision)||typeof v.sha256!=='string'||!/^[a-f0-9]{64}$/.test(v.sha256)||
    !id(v.bytes)||v.bytes>2*1024*1024||!id(v.actorId)||!text(v.actorName)||typeof v.recordedAt!=='string'||!Number.isFinite(Date.parse(v.recordedAt))||
    typeof v.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.requestId)||typeof v.replayed!=='boolean'||
    ![v.parentCurrent,v.referenceCurrent,v.photoCurrent,v.current].every(flag=>typeof flag==='boolean'))return false;
  return v.current===(v.parentCurrent&&v.referenceCurrent&&v.photoCurrent);
}
