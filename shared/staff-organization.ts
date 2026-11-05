import {STAFF_DEPARTMENTS,staffRoles} from './staff-positions';

export interface OrganizationPerson {
  id:number;name:string;status:string;position?:unknown;store_id?:number|null;
  code?:unknown;phone?:unknown;email?:unknown;store_name?:unknown;
}
export interface OrganizationStore {id:number;name:string}
const searchKey=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
export function matchesOrganizationStaff(person:OrganizationPerson,query:string){
  const needle=searchKey(query.trim());
  return !needle||searchKey([person.name,person.code,person.phone,person.email,person.position,person.store_name].map(part=>String(part||'')).join(' ')).includes(needle);
}
export function scopeOrganizationStaff<T extends OrganizationPerson>(people:T[],store:string,departed:boolean,search:string){
  return people.filter(person=>(store==='all'||String(person.store_id||'')===store||staffRoles(person.position).includes('TLS'))
    &&(departed||person.status!=='leave'||!!search.trim()&&matchesOrganizationStaff(person,search)));
}
/** The caller supplies only rows already visible under the current web/RLS scope. */
export function buildStaffOrganization<T extends OrganizationPerson,S extends OrganizationStore>(people:T[],allStores:S[],store='all',departed=false,search=''){
  const scoped=scopeOrganizationStaff(people,store,departed,search);
  const staff=scoped.filter(person=>matchesOrganizationStaff(person,search));
  const stores=allStores.filter(item=>store==='all'||String(item.id)===store);
  const defs=store==='all'?STAFF_DEPARTMENTS:STAFF_DEPARTMENTS.filter(department=>department.role==='TLS');
  const departments=defs.map(department=>({...department,people:staff.filter(person=>staffRoles(person.position).includes(department.role)&&(department.role!=='NVKD'||!person.store_id))})).filter(department=>department.people.length);
  const unassigned=store==='all'?staff.filter(person=>!allStores.some(item=>item.id===person.store_id)&&!departments.some(department=>department.people.includes(person))):[];
  const shown=staff.filter(person=>unassigned.includes(person)||departments.some(department=>department.people.includes(person))||stores.some(item=>item.id===person.store_id)||staffRoles(person.position).includes('TLS'));
  return {departments,unassigned,shown,stores:stores.map(item=>({...item,people:staff.filter(person=>person.store_id===item.id)})),working:shown.filter(person=>!['inactive','leave'].includes(person.status)).length};
}
