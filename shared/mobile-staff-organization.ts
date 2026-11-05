export interface MobileOrganizationPerson {id:number;name:string;code:string;phone:string;email:string;position:string;storeId:number|null;storeName:string;status:string}
export interface MobileOrganizationSection {key:string;title:string;kind:'department'|'store'|'unassigned';storeId:number|null;people:MobileOrganizationPerson[]}
export interface MobileStaffOrganization {stores:{id:number;name:string}[];sections:MobileOrganizationSection[];total:number;working:number;storeCount:number}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>0;
const count=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0;
export function isMobileStaffOrganization(v:unknown):v is MobileStaffOrganization {
  if(!object(v)||!Array.isArray(v.stores)||!v.stores.every(s=>object(s)&&id(s.id)&&typeof s.name==='string')||!Array.isArray(v.sections)||!['total','working','storeCount'].every(k=>count(v[k]))||Number(v.working)>Number(v.total))return false;
  return v.sections.every(s=>object(s)&&typeof s.key==='string'&&typeof s.title==='string'&&['department','store','unassigned'].includes(String(s.kind))&&(s.storeId===null||id(s.storeId))&&Array.isArray(s.people)&&s.people.every(p=>object(p)&&id(p.id)&&(p.storeId===null||id(p.storeId))&&['name','code','phone','email','position','storeName','status'].every(k=>typeof p[k]==='string')));
}
