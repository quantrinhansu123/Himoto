export const MOBILE_BULK_KINDS=['staff','stores','customers','vehicles'] as const;
export type MobileBulkKind=typeof MOBILE_BULK_KINDS[number];
export const MOBILE_BULK_LABELS:Record<MobileBulkKind,string>={staff:'nhân sự',stores:'cơ sở',customers:'khách hàng',vehicles:'xe'};
export const bulkDeleteOperation=(kind:MobileBulkKind)=>`bulk.${kind}.delete`;
export const isBulkDeleteOperation=(v:unknown):v is string=>typeof v==='string'&&/^bulk\.(staff|stores|customers|vehicles)\.delete$/.test(v);
export const isMobileBulkKind=(v:unknown):v is MobileBulkKind=>typeof v==='string'&&MOBILE_BULK_KINDS.some(k=>k===v);
export interface MobileBulkReview {kind:MobileBulkKind;review:string;rows:{id:number;code:string;name:string;status:string;storeName:string}[]}
export interface MobileBulkDeletion {key:string;kind:MobileBulkKind;operation:string;deletedCount:number;receiptVersion:1;replayed:boolean}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function isMobileBulkReview(v:unknown):v is MobileBulkReview{return object(v)&&isMobileBulkKind(v.kind)&&typeof v.review==='string'&&/^[a-f0-9]{64}$/.test(v.review)&&Array.isArray(v.rows)&&v.rows.length>0&&v.rows.length<=500&&v.rows.every(r=>object(r)&&Number.isSafeInteger(r.id)&&Number(r.id)>0&&['code','name','status','storeName'].every(k=>typeof r[k]==='string'))&&new Set(v.rows.map(r=>r.id)).size===v.rows.length;}
export function isMobileBulkDeletion(v:unknown):v is MobileBulkDeletion{return object(v)&&typeof v.key==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v.key)&&isMobileBulkKind(v.kind)&&v.operation===bulkDeleteOperation(v.kind)&&Number.isSafeInteger(v.deletedCount)&&Number(v.deletedCount)>0&&Number(v.deletedCount)<=500&&v.receiptVersion===1&&typeof v.replayed==='boolean';}
