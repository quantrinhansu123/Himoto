import type { ContractExcelSource } from '../src/lib/management/contract-import';
import type { MobileJsonExport } from './mobile-export';
export type { ContractExcelSource };
export interface MobileContractWorkbook {filename:string;storeId:number;sha256:string;sources:ContractExcelSource[];signature:string}
export interface MobileContractImportPreview {
  batchId:string;revision:string;expectedAdded:number;existing:number;blocked:number;total:number;
  plans:{sourceId:string;state:'new'|'existing'|'blocked';targetId:number|null;customer:string;licenses:string[];errors:string[];warnings:string[]}[];
  backup:MobileJsonExport;backupSha:string;backupSnapshotSha:string;manifestSha:string;signature:string;
}
export interface MobileContractImportInput {
  files:MobileContractWorkbook[];batchId:string;revision:string;expectedAdded:number;
  backupSha:string;backupSnapshotSha:string;manifestSha:string;signature:string;verifiedBackupSha:string;
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const integer=(v:unknown,min=0)=>Number.isSafeInteger(v)&&Number(v)>=min;
const texts=(v:unknown)=>Array.isArray(v)&&v.length<=1000&&v.every(t=>typeof t==='string'&&t.length<=4000);
export function isMobileContractWorkbook(v:unknown):v is MobileContractWorkbook {
  return object(v)&&typeof v.filename==='string'&&v.filename.length<=255&&!/[\\/]/.test(v.filename)&&/\.xlsx$/i.test(v.filename)&&integer(v.storeId,1)&&hash(v.sha256)&&hash(v.signature)&&Array.isArray(v.sources)&&v.sources.length>0&&v.sources.length<=1000&&v.sources.every(row=>object(row)&&row.filename===v.filename&&row.storeId===v.storeId&&integer(row.rowNumber,2)&&Number(row.rowNumber)<=10001&&['sourceId','createdAt','name','phone','originalPhone','vehicleName','license','start','end','note','paid','total','status'].every(k=>typeof row[k]==='string'&&String(row[k]).length<=4000)&&texts(row.errors));
}
export function isMobileContractImportPreview(v:unknown):v is MobileContractImportPreview {
  if(!object(v)||!uuid(v.batchId)||!['revision','backupSha','backupSnapshotSha','manifestSha','signature'].every(k=>hash(v[k]))||!['expectedAdded','existing','blocked','total'].every(k=>integer(v[k]))||Number(v.total)>1000||Number(v.expectedAdded)+Number(v.existing)+Number(v.blocked)!==v.total||!Array.isArray(v.plans)||v.plans.length!==v.total||!object(v.backup))return false;
  return v.backup.filename===`HIMOTO-contracts-backup-${v.batchId}.json`&&v.backup.mimeType==='application/json'&&typeof v.backup.content==='string'&&v.backup.content.startsWith('{')&&v.backup.content.length<=32*1024*1024&&integer(v.backup.rowCount)&&v.plans.every(row=>object(row)&&typeof row.sourceId==='string'&&['new','existing','blocked'].includes(String(row.state))&&(row.targetId===null||integer(row.targetId,1))&&typeof row.customer==='string'&&texts(row.licenses)&&texts(row.errors)&&texts(row.warnings));
}
