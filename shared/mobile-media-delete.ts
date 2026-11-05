import type {MobileWriteReceipt} from './mobile-contract';
import {isMediaRevision,isMobileMediaTarget,isMobileMediaPhoto,mediaOperation,type MobileMediaEntity,type MobileMediaTarget,type MobileMediaPhoto} from './mobile-record-media';

export const mediaDeleteOperation=(entity:MobileMediaEntity,id:number)=>`media.delete.${entity==='contracts'?'contract':entity==='customers'?'customer':'vehicle'}:${id}`;
export const mediaMutationOperations=(entity:MobileMediaEntity,id:number)=>[mediaOperation(entity,id),...(entity==='contracts'?[`media.copy:${id}`,`video.record:${id}`,`draft.delete:${id}`]:[]),mediaDeleteOperation(entity,id)];
export interface MobileMediaDeleteReceipt extends MobileWriteReceipt {
  requestId:string;target:MobileMediaTarget;photo:MobileMediaPhoto;actorId:number;actorName:string;recordedAt:string;
  parentCurrent:boolean;referenceCurrent:boolean;slotEmpty:boolean;current:boolean;
}
export function isMediaDeleteReceipt(value:unknown):value is MobileMediaDeleteReceipt {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const v=value as MobileMediaDeleteReceipt;
  return isMobileMediaTarget(v.target)&&v.id===v.target.id&&isMediaRevision(v.revision)&&v.revision===v.target.revision&&isMobileMediaPhoto(v.photo,v.target)&&
    typeof v.requestId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.requestId)&&typeof v.replayed==='boolean'&&
    Number.isSafeInteger(v.actorId)&&v.actorId>0&&typeof v.actorName==='string'&&v.actorName.length<=4000&&typeof v.recordedAt==='string'&&Number.isFinite(Date.parse(v.recordedAt))&&
    [v.parentCurrent,v.referenceCurrent,v.slotEmpty,v.current].every(flag=>typeof flag==='boolean')&&v.current===(v.parentCurrent&&v.referenceCurrent&&v.slotEmpty);
}
