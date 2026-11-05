import type {MobileWriteReceipt} from './mobile-contract';
import {isMediaRevision} from './mobile-record-media';

export interface MobileCustomerPhotoCopyReview {
  id:number;revision:string;customerId:number|null;sourceCount:number;missingCount:number;presentCount:number;snapshot:string;observedAt:string;
}
export interface MobileCustomerPhotoCopyReceipt extends MobileWriteReceipt {
  requestId:string;customerId:number|null;copied:number;sourceCount:number;presentCount:number;resultSnapshot:string;
  actorId:number;actorName:string;recordedAt:string;parentCurrent:boolean;photosCurrent:boolean;current:boolean;
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=999999999999999;
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const date=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v));
export const customerPhotoCopyOperation=(id:number)=>`media.copy:${id}`;
export function isCustomerPhotoCopyReview(v:unknown):v is MobileCustomerPhotoCopyReview {
  return object(v)&&id(v.id)&&isMediaRevision(v.revision)&&(v.customerId===null||id(v.customerId))&&count(v.sourceCount)&&count(v.missingCount)&&count(v.presentCount)&&
    v.sourceCount===v.missingCount+v.presentCount&&(v.customerId!==null||v.sourceCount===0)&&hash(v.snapshot)&&date(v.observedAt);
}
export function isCustomerPhotoCopyReceipt(v:unknown):v is MobileCustomerPhotoCopyReceipt {
  return object(v)&&id(v.id)&&isMediaRevision(v.revision)&&typeof v.replayed==='boolean'&&
    typeof v.requestId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.requestId)&&
    (v.customerId===null||id(v.customerId))&&count(v.copied)&&count(v.sourceCount)&&count(v.presentCount)&&v.copied+v.presentCount===v.sourceCount&&
    (v.customerId!==null||v.sourceCount===0)&&hash(v.resultSnapshot)&&id(v.actorId)&&typeof v.actorName==='string'&&v.actorName.length<=4000&&date(v.recordedAt)&&
    typeof v.parentCurrent==='boolean'&&typeof v.photosCurrent==='boolean'&&typeof v.current==='boolean'&&v.current===(v.parentCurrent&&v.photosCurrent);
}
