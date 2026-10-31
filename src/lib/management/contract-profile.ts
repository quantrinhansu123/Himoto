import type { ContractDraft } from './contract-document';
import { contractNumberError, paperContractNumber } from './contract-number';
import { hasPermission, isAdminAccount, type PermissionAccount } from './permissions';

/** Nhân viên có contracts.draft được sửa HĐ đã phát hành; phạm vi cơ sở do RLS / phân quyền xem quyết định. */
export function canEditIssuedContract(account:PermissionAccount|null|undefined,_storeId?:unknown) {
  return isAdminAccount(account) || hasPermission(account,'contracts.draft');
}

/** null = được sửa. Lý do tiếng Việt khi nút Sửa bị chặn. */
export function contractIssuedEditBlockReason(account:PermissionAccount|null|undefined,_storeId?:unknown) {
  if (canEditIssuedContract(account,_storeId)) return null;
  if (!account) return 'Đăng nhập để sửa hợp đồng.';
  return 'Tài khoản chưa được cấp quyền Lập / sửa hợp đồng.';
}
export function issuedContractNumberError(value:string) {
  return contractNumberError(value) || (!value.trim() || !paperContractNumber(value) ? 'Nhập số HĐ giấy, không dùng mã NHAP-/EXCEL-.' : null);
}
export type ContractProfileEdits = {contract_number?:string;notes?:string;status?:string};
export type ContractProfile = Pick<ContractDraft,'customer'|'relatives'|'staff_id'|'staff_name'|'signed_on'|'authorization_date'|'collateral_description'|'document_requirements'|'sales_staff_id'|'sales_staff_name'|'tls_staff_id'|'ownership_term_months'> & Partial<Pick<ContractDraft,'customer_source'|'created_on'>>;
export const PROFILE_KEYS = ['customer','relatives','staff_id','staff_name','signed_on','authorization_date','collateral_description','document_requirements','sales_staff_id','sales_staff_name','tls_staff_id','ownership_term_months','customer_source','created_on'] as const;
export function contractProfile(draft:ContractDraft):ContractProfile {
  return Object.fromEntries(PROFILE_KEYS.filter(key=>draft[key] !== undefined).map(key=>[key,draft[key]])) as unknown as ContractProfile;
}
export async function saveContractProfile(id:number,revision:string,profile:ContractProfile,edits:ContractProfileEdits={}) {
  const response=await fetch(`/api/auth/order/car-rental/${id}/profile`,{method:'PATCH',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,profile,...edits})});
  const result=await response.json().catch(()=>null);
  if(!response.ok || result?.status !== 'success' || typeof result.data?.revision !== 'string')throw new Error(result?.message || 'Chưa lưu được hồ sơ hợp đồng.');
  return result.data as {revision:string;code?:string};
}
