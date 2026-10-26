import type { ContractDraft } from './contract-document';
import { contractNumberError, paperContractNumber } from './contract-number';
import { hasPermission, isAdminAccount, type PermissionAccount } from './permissions';

export function canEditIssuedContract(account:PermissionAccount|null|undefined,storeId:unknown) {
  return isAdminAccount(account) || Boolean(hasPermission(account,'contracts.draft') && Number(account?.store_id)>0 && Number(account?.store_id)===Number(storeId));
}
export function issuedContractNumberError(value:string) {
  return contractNumberError(value) || (!value.trim() || !paperContractNumber(value) ? 'Nhập số HĐ giấy, không dùng mã NHAP-/EXCEL-.' : null);
}
export type ContractProfileEdits = {contract_number?:string;notes?:string;status?:string};
export type ContractProfile = Pick<ContractDraft,'customer'|'relatives'|'staff_id'|'staff_name'|'signed_on'|'authorization_date'|'collateral_description'|'document_requirements'|'sales_staff_id'|'sales_staff_name'|'tls_staff_id'|'ownership_term_months'> & Partial<Pick<ContractDraft,'customer_source'>>;
export const PROFILE_KEYS = ['customer','relatives','staff_id','staff_name','signed_on','authorization_date','collateral_description','document_requirements','sales_staff_id','sales_staff_name','tls_staff_id','ownership_term_months','customer_source'] as const;
export function contractProfile(draft:ContractDraft):ContractProfile {
  return Object.fromEntries(PROFILE_KEYS.filter(key=>draft[key] !== undefined).map(key=>[key,draft[key]])) as unknown as ContractProfile;
}
export async function saveContractProfile(id:number,revision:string,profile:ContractProfile,edits:ContractProfileEdits={}) {
  const response=await fetch(`/api/auth/order/car-rental/${id}/profile`,{method:'PATCH',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,profile,...edits})});
  const result=await response.json().catch(()=>null);
  if(!response.ok || result?.status !== 'success' || typeof result.data?.revision !== 'string')throw new Error(result?.message || 'Chưa lưu được hồ sơ hợp đồng.');
  return result.data as {revision:string;code?:string};
}
