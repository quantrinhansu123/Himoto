export interface MobileFleetVehicle {
  id:number;name:string;license:string;type:string;status:string;
  storeId:number;storeName:string;fromStoreName:string;toStoreName:string;available:boolean;
}
export interface MobileFleetInventory {
  rows:MobileFleetVehicle[];stores:{id:number;name:string}[];
  total:number;scopeCount:number;page:number;pages:number;
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown,min=0)=>Number.isSafeInteger(v)&&Number(v)>=min;
export function isFleetInventory(v:unknown):v is MobileFleetInventory {
  return object(v)&&integer(v.total)&&integer(v.scopeCount)&&Number(v.total)<=Number(v.scopeCount)&&integer(v.page,1)&&integer(v.pages,1)&&Number(v.page)<=Number(v.pages)&&
    Array.isArray(v.rows)&&v.rows.length<=25&&v.rows.every(row=>object(row)&&integer(row.id,1)&&integer(row.storeId,1)&&['name','license','type','status','storeName','fromStoreName','toStoreName'].every(key=>typeof row[key]==='string')&&typeof row.available==='boolean')&&
    Array.isArray(v.stores)&&v.stores.every(row=>object(row)&&integer(row.id,1)&&typeof row.name==='string');
}
