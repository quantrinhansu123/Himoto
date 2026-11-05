import { ACCESS_PERMISSIONS,ACCESS_ROLES,type AccessRole } from './access-permissions';
import type { AccountValues } from './account-management';
import type { MobileWriteReceipt } from './mobile-contract';
import { isStaffCredentials,type MobileStaffCredentials } from './mobile-staff';
export type { MobileStaffCredentials } from './mobile-staff';
export * from './access-permissions';
export { parseAccountValues,AccountAccessError,type AccountValues } from './account-management';
export { validateNewPassword } from './account-password-validation';
export interface ManagedAccount {id:number;name:string;email:string;login_name:string|null;status:string;access_role:AccessRole|null;store_id:number|null;store_name:string|null;scope_all:boolean;permissions:string[]|null;enabled:boolean|null;revision:string;staff_id?:number;staff_code?:string;staff_status?:string;password_available:boolean;password_changed_at:string|null;can_edit:boolean;can_delete:boolean}
export interface ManagedAccountsPage {rows:ManagedAccount[];total:number;page:number;pages:number;staffCount:number}
export interface ManagedAccountOptions {stores:{id:number;name:string;kind:string}[];canRevealPasswords:boolean}
export type ManagedAccountInput=AccountValues&{revision?:string};
export interface ManagedAccountWriteResult extends MobileWriteReceipt {credentials:MobileStaffCredentials|null}
export interface ManagedAccountResult {key:string;operation:string;receipt:MobileWriteReceipt;current:ManagedAccount|null;deleted:boolean;ownPasswordChange:boolean}
export interface ManagedPasswordResult extends MobileWriteReceipt {password:string|null;changedAt:string|null}
export const accountWriteOperations=(id:number|string)=>[`account.update:${id}`,`account.delete:${id}`,`account.password:${id}`];
export const ACCOUNT_PERMISSION_GROUPS=[
  {title:'Hợp đồng',permissions:['contracts.read','contracts.draft','contracts.finalize','contracts.renew','contracts.return']},
  {title:'Khách hàng',permissions:['customers.read','customers.write']},
  {title:'Xe và kho',permissions:['vehicles.read','vehicles.transfer','vehicles.receive','vehicles.write']},
  {title:'Nhân sự',permissions:['hr.read','hr.write']},
  {title:'Tài chính và đối soát',permissions:['finance.read','finance.write','shift.review']},
  {title:'Hệ thống',permissions:['settings.write']},
] as const;
export function managedAccountInput(row:ManagedAccount):ManagedAccountInput{return{name:row.name,login_name:row.login_name||row.email.split('@')[0],password:'',access_role:row.access_role||'admin',store_id:row.store_id,scope_all:row.scope_all,permissions:row.access_role==='admin'?[...ACCESS_PERMISSIONS]:row.permissions||[...ACCESS_PERMISSIONS],enabled:row.enabled??row.status==='active'};}
export function newManagedAccount(store:number|null=null):ManagedAccountInput{return{name:'',login_name:'',password:'',access_role:'branch_staff',store_id:store,scope_all:false,permissions:[...ACCESS_ROLES.branch_staff.permissions],enabled:true};}
export function changeManagedAccountRole(input:ManagedAccountInput,role:AccessRole):ManagedAccountInput{return{...input,access_role:role,permissions:[...ACCESS_ROLES[role].permissions],scope_all:['admin','hr','accounting','internal_control','headquarters_sales','headquarters_debt'].includes(role)};}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v),id=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>0;
const revision=(v:unknown)=>typeof v==='string'&&/^[1-9]\d{0,19}$/.test(v);
function receipt(v:unknown):v is MobileWriteReceipt{return object(v)&&id(v.id)&&revision(v.revision)&&typeof v.replayed==='boolean';}
export function isManagedAccount(v:unknown):v is ManagedAccount{return object(v)&&!['password','password_hash','password_fingerprint','password_cipher'].some(k=>k in v)&&id(v.id)&&revision(v.revision)&&['name','email','status'].every(k=>typeof v[k]==='string')&&(v.access_role===null||typeof v.access_role==='string'&&Object.hasOwn(ACCESS_ROLES,v.access_role))&&(v.store_id===null||id(v.store_id))&&typeof v.scope_all==='boolean'&&(v.permissions===null||Array.isArray(v.permissions)&&v.permissions.every(p=>typeof p==='string'))&&(v.enabled===null||typeof v.enabled==='boolean')&&['login_name','store_name','password_changed_at'].every(k=>v[k]===null||typeof v[k]==='string')&&['password_available','can_edit','can_delete'].every(k=>typeof v[k]==='boolean');}
export function isManagedAccountsPage(v:unknown):v is ManagedAccountsPage{return object(v)&&Array.isArray(v.rows)&&v.rows.every(isManagedAccount)&&['total','page','pages','staffCount'].every(k=>Number.isSafeInteger(v[k]));}
export function isManagedAccountOptions(v:unknown):v is ManagedAccountOptions{return object(v)&&Array.isArray(v.stores)&&v.stores.every(s=>object(s)&&id(s.id)&&typeof s.name==='string'&&typeof s.kind==='string')&&typeof v.canRevealPasswords==='boolean';}
export function isManagedAccountWriteResult(v:unknown):v is ManagedAccountWriteResult{return receipt(v)&&object(v)&&(v.credentials===null||!v.replayed&&isStaffCredentials(v.credentials));}
export function isManagedAccountResult(v:unknown):v is ManagedAccountResult{return object(v)&&typeof v.key==='string'&&typeof v.operation==='string'&&receipt(v.receipt)&&typeof v.deleted==='boolean'&&typeof v.ownPasswordChange==='boolean'&&(v.ownPasswordChange?v.current===null&&!v.deleted:v.deleted?v.current===null:isManagedAccount(v.current)&&v.current.id===v.receipt.id);}
export function isManagedPasswordResult(v:unknown):v is ManagedPasswordResult{return receipt(v)&&object(v)&&(v.password===null||!v.replayed&&typeof v.password==='string')&&(v.changedAt===null||typeof v.changedAt==='string');}
