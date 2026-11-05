export const CUSTOMER_OCR_KINDS = ['cccd_front','cccd_back','passport','driver_license','customer_documents'] as const;
export type CustomerOcrKind = typeof CUSTOMER_OCR_KINDS[number];
export const CUSTOMER_OCR_FIELDS = ['id_card','name','id_card_issued_on','id_card_issued_by','driver_license_number','driver_license_issued_on'] as const;
export type CustomerOcrFields = Partial<Record<typeof CUSTOMER_OCR_FIELDS[number],string>>;
export interface MobileCustomerOcr {
  requestId:string;kind:CustomerOcrKind;expectedIdentity:string;fields:CustomerOcrFields;warnings:string[];
}
export const isOcrRequestId=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
// Same merge rule as web mergeOcrCustomer: edits made during the request win;
// current address and contact fields never come from identity OCR.
export function mergeCustomerOcr(current:MobileCustomerInput,result:CustomerOcrFields,before:MobileCustomerInput,previousAi:CustomerOcrFields){
  const customer={...current},applied:CustomerOcrFields={};
  if(current.id_card!==before.id_card&&current.id_card!==result.id_card)return {customer,applied};
  for(const key of CUSTOMER_OCR_FIELDS)if(result[key]&&(current[key]===before[key]||current[key]===previousAi[key])){
    customer[key]=result[key];applied[key]=result[key];
  }
  return {customer,applied};
}
export function nextCustomerDocumentSlot(base:string,keys:string[]){
  if(!['id_front','id_back','driver_license'].includes(base))throw Error('Ô giấy tờ không hợp lệ.');
  if(!keys.includes(base))return base;
  let index=2;while(keys.includes(`${base}-extra-${index}`))index++;
  return `${base}-extra-${index}`;
}
export function isMobileCustomerOcr(value:unknown,requestId:string,kind:CustomerOcrKind,expectedIdentity:string):value is MobileCustomerOcr {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const result=value as MobileCustomerOcr;
  const keys=kind==='driver_license'?CUSTOMER_OCR_FIELDS.slice(4):kind==='customer_documents'?CUSTOMER_OCR_FIELDS:
    kind==='cccd_back'?CUSTOMER_OCR_FIELDS.slice(0,4).filter(key=>key!=='name'):CUSTOMER_OCR_FIELDS.slice(0,4);
  return isOcrRequestId(result.requestId)&&result.requestId===requestId&&result.kind===kind&&result.expectedIdentity===expectedIdentity&&
    !!result.fields&&typeof result.fields==='object'&&!Array.isArray(result.fields)&&Object.entries(result.fields).length<=6&&
    Object.entries(result.fields).every(([key,text])=>(keys as readonly string[]).includes(key)&&typeof text==='string'&&text.length<=255)&&
    Array.isArray(result.warnings)&&result.warnings.length<=24&&result.warnings.every(text=>typeof text==='string'&&text.length<=1000);
}
import type {MobileCustomerInput} from './mobile-contract';
