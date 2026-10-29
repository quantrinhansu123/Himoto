import { hasPermission,isAdminAccount,type PermissionAccount } from './permissions';
import type { OwnershipTerm } from './contract-billing';

export function canEditOwnershipTerms(account:PermissionAccount|null|undefined) {
  return hasPermission(account,'contracts.draft')&&(isAdminAccount(account)||account?.access_role==='ownership_manager'||account?.access_role==='ownership_staff');
}
export interface OwnershipTermsState {
  id:number;code:string;revision:string;status:string;term_months:OwnershipTerm;daily_amount:number|null;
  can_edit:boolean;history:{at:string;actor:string;before:{term_months:OwnershipTerm;daily_amount:number|null};after:{term_months:OwnershipTerm;daily_amount:number|null}}[];
}
export interface OwnershipTermsInput {revision:string;request_id:string;term_months:OwnershipTerm;daily_amount:string|null}
export class OwnershipTermsRequestError extends Error {constructor(message:string,public status:number){super(message);}}
async function request(id:number,input?:OwnershipTermsInput,signal?:AbortSignal):Promise<OwnershipTermsState> {
  const response=await fetch(`/api/auth/order/car-rental/${id}/ownership-terms`,{method:input?'PATCH':'GET',cache:'no-store',credentials:'same-origin',signal,
    ...(input?{headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}:{})});
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.status!=='success')throw new OwnershipTermsRequestError(result?.message||'Không đọc được thời hạn và mức đóng thuê sở hữu.',response.status);
  return result.data;
}
export const loadOwnershipTerms=(id:number,signal?:AbortSignal)=>request(id,undefined,signal);
export const saveOwnershipTerms=(id:number,input:OwnershipTermsInput)=>request(id,input);
