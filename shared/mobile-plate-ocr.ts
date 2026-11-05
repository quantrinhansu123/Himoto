import {isOcrRequestId} from './mobile-customer-ocr';
import type {MobileDraftInventory} from './mobile-contract';
import {isMobileDraftInventory} from './mobile-draft-validation';
export const plateKey=(value:string)=>value.toUpperCase().replace(/[^A-Z0-9]/g,'');
export interface MobilePlateOcr {requestId:string;kind:'plate';fields:{license?:string};warnings:string[]}
export interface MobilePlateMatch {license:string;match:'none'|'unique'|'ambiguous';vehicle:MobileDraftInventory['rows'][number]|null;observedAt:string}
export function isMobilePlateMatch(v:unknown,license:string):v is MobilePlateMatch {
  if(!v||typeof v!=='object'||Array.isArray(v))return false;const row=v as MobilePlateMatch;
  return row.license===license&&['none','unique','ambiguous'].includes(row.match)&&typeof row.observedAt==='string'&&Number.isFinite(Date.parse(row.observedAt))&&
    (row.match==='unique'?!!row.vehicle&&isMobileDraftInventory({page:1,hasMore:false,rows:[row.vehicle]})&&plateKey(row.vehicle.vehicle.license)===plateKey(license):row.vehicle===null);
}
export function isMobilePlateOcr(v:unknown,requestId:string):v is MobilePlateOcr {
  if(!v||typeof v!=='object'||Array.isArray(v))return false;const row=v as MobilePlateOcr;
  return isOcrRequestId(row.requestId)&&row.requestId===requestId&&row.kind==='plate'&&!!row.fields&&typeof row.fields==='object'&&!Array.isArray(row.fields)&&
    Object.keys(row.fields).every(k=>k==='license')&&(row.fields.license===undefined||typeof row.fields.license==='string'&&row.fields.license.length<=25&&/^\d{2}[A-Z]{1,2}\d?\d{4,6}$/.test(plateKey(row.fields.license)))&&
    Array.isArray(row.warnings)&&row.warnings.length<=24&&row.warnings.every(s=>typeof s==='string'&&s.length<=1000);
}
/** Preserve the same empty-line and in-flight selection rules as ContractComposer. */
export function plateSelectionIndex(before:string[],current:string[],vehicleId:string,scan:boolean) {
  const existing=current.indexOf(vehicleId);if(existing>=0)return existing;
  if(!scan)throw Error('Xe đã thay đổi trong lúc AI đọc ảnh. Chụp lại ảnh cho xe đang chọn.');
  const index=before.findIndex(id=>!id);
  if(index<0)throw Error('Bấm Thêm xe để thêm vào hợp đồng, rồi đọc lại ảnh.');
  if(current.length!==before.length||current[index]!==before[index])throw Error('Lựa chọn xe đã thay đổi trong lúc AI đọc ảnh. Giữ nguyên xe đang chọn; đọc lại ảnh nếu cần.');
  return index;
}
