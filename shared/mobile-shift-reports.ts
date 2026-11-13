import { parseShiftInput,type ShiftReport,type ShiftInput } from "./shift-reports";
import { parseAuditInput,type ShiftSnapshot,type AuditInput } from "./shift-audits";
export { SHIFT_PHOTOS,SHIFT_SUMMARY_FIELDS,emptyShiftSummary,parseShiftInput,shiftVehicleTotal } from "./shift-reports";
export { AUDIT_FIELDS,emptyAuditInput,parseAuditInput,auditComparisons,validateAuditConfirmation } from "./shift-audits";
export { OWNERSHIP_REPORT_GROUPS,blankOwnershipReport,ownershipKeys,validateOwnershipSubmission,reconciliation } from "./ownership-report";
export { SHIFT_AUTOFILL_SECTIONS } from "./shift-autofill";
export type { ShiftReport,ShiftInput,ShiftSnapshot,AuditInput };
export interface ShiftTelegramState {status:string;message_id:number|null;error_code:string|null;attachment_count?:number;media_count?:number}
export type { ShiftAutofillResult,ShiftAutofillSection } from "./shift-autofill";
export interface MobileShiftOptions { canWrite:boolean;canReview:boolean;stores:{id:number;name:string;kind:string}[] }
export interface MobileShiftResult { key:string;operation:string;receipt:{id:number;revision:string};current:ShiftReport }
export interface MobileShiftSave { payload:ShiftInput;id?:number;revision?:number;status:"draft"|"submitted" }
export interface MobileAuditSave { input:AuditInput;revision:number;report_revision:number;fingerprint:string;status:"draft"|"confirmed" }
export interface MobileShiftVideoReview {revision:number;stage:'pgd'|'audit';category:string}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const integer=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>0;
export function isShiftReport(v:unknown):v is ShiftReport {
  if(!object(v)||!integer(v.id)||!integer(v.revision)||!["draft","submitted"].includes(String(v.status))||!["store_name","created_by_name","updated_at"].every(k=>typeof v[k]==="string")||!Array.isArray(v.photos)||!v.photos.every(p=>typeof p==="string"))return false;
  if(v.media!==undefined&&(!Array.isArray(v.media)||!v.media.every(m=>
    object(m)&&typeof m.id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(m.id)&&
    ['pgd','audit'].includes(String(m.stage))&&typeof m.category==='string'&&
    typeof m.mime_type==='string'&&m.mime_type.length<=120&&
    typeof m.filename==='string'&&m.filename.length<=255&&typeof m.url==='string'&&m.url.length<=4000
  )))return false;
  try{parseShiftInput(v.payload);if(v.audit){if(!object(v.audit)||!integer(v.audit.revision)||!["draft","confirmed"].includes(String(v.audit.status)))return false;parseAuditInput(v.audit.input);}return true;}catch{return false;}
}
export function isShiftOptions(v:unknown):v is MobileShiftOptions {return object(v)&&typeof v.canWrite==="boolean"&&typeof v.canReview==="boolean"&&Array.isArray(v.stores)&&v.stores.every(s=>object(s)&&integer(s.id)&&typeof s.name==="string"&&typeof s.kind==="string");}
export function isShiftResult(v:unknown):v is MobileShiftResult {return object(v)&&typeof v.key==="string"&&typeof v.operation==="string"&&object(v.receipt)&&integer(v.receipt.id)&&/^[1-9]\d{0,19}$/.test(String(v.receipt.revision))&&isShiftReport(v.current)&&v.current.id===v.receipt.id;}
export function isShiftSnapshot(v:unknown):v is ShiftSnapshot {return object(v)&&typeof v.fingerprint==="string"&&/^[0-9a-f]{64}$/.test(v.fingerprint)&&typeof v.date==="string"&&typeof v.captured_at==="string"&&object(v.values)&&Array.isArray(v.transfers)&&typeof v.inventory_note==="string"&&typeof v.accounts_note==="string";}
