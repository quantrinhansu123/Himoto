import type { ContractType } from './contract-types';
export * from './contract-types';
export type ContractTypeOperation='ctype.create'|'ctype.update';
export type MobileContractTypeReceipt={typeId:string;revision:string;replayed:boolean};
export type MobileContractTypeResult={key:string;operation:ContractTypeOperation;receipt:MobileContractTypeReceipt;current:ContractType};
export type MobileContractTypeResolution={key:string;operation:ContractTypeOperation;resourceKind:'contract-type'}&(
  {status:'cancelled';receipt:null}|{status:'committed';receipt:MobileContractTypeReceipt}
);
export function isContractTypeOperation(v:unknown):v is ContractTypeOperation{return v==='ctype.create'||v==='ctype.update';}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function isContractType(v:unknown):v is ContractType{return object(v)&&typeof v.id==='string'&&/^[a-z0-9_-]{1,80}$/.test(v.id)&&typeof v.label==='string'&&typeof v.rental_type==='string'&&(v.term_months===null||Number.isSafeInteger(v.term_months)&&Number(v.term_months)>=1&&Number(v.term_months)<=120)&&typeof v.active==='boolean'&&typeof v.revision==='string'&&/^[1-9]\d{0,19}$/.test(v.revision);}
export function isContractTypes(v:unknown):v is ContractType[]{return Array.isArray(v)&&v.every(isContractType);}
export function isContractTypeReceipt(v:unknown):v is MobileContractTypeReceipt{return object(v)&&typeof v.typeId==='string'&&/^[a-z0-9_-]{1,80}$/.test(v.typeId)&&typeof v.revision==='string'&&/^[1-9]\d{0,19}$/.test(v.revision)&&typeof v.replayed==='boolean';}
export function isContractTypeResult(v:unknown):v is MobileContractTypeResult{return object(v)&&typeof v.key==='string'&&isContractTypeOperation(v.operation)&&isContractTypeReceipt(v.receipt)&&isContractType(v.current)&&v.receipt.typeId===v.current.id;}
export function isContractTypeResolution(v:unknown):v is MobileContractTypeResolution{return object(v)&&typeof v.key==='string'&&isContractTypeOperation(v.operation)&&v.resourceKind==='contract-type'&&(v.status==='cancelled'?v.receipt===null:v.status==='committed'&&isContractTypeReceipt(v.receipt)&&v.receipt.replayed);}
