export interface BatteryMediaFile {id:string;mimeType:string;bytes:number;createdAt:string}
export interface BatteryMedia {id:number;eventKey:string;action:'rental'|'renew'|'collect_renewal'|'return';canWrite:boolean;rows:BatteryMediaFile[]}
export const isBatteryMedia=(v:unknown):v is BatteryMedia=>{
  if(!v||typeof v!=='object')return false;const row=v as BatteryMedia;
  return Number.isSafeInteger(row.id)&&row.id>0&&typeof row.eventKey==='string'&&['rental','renew','collect_renewal','return'].includes(row.action)&&typeof row.canWrite==='boolean'&&Array.isArray(row.rows)&&row.rows.length<=100&&row.rows.every(f=>!!f&&/^[a-f0-9-]{36}$/.test(f.id)&&['image/jpeg','image/png','image/webp'].includes(f.mimeType)&&Number.isSafeInteger(f.bytes)&&f.bytes>0&&f.bytes<=2097152&&Number.isFinite(Date.parse(f.createdAt)));
};
