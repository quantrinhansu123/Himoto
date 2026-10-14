import type { ContractDraft } from './contract-document';
export type ContractProfile = Pick<ContractDraft,'customer'|'relatives'|'staff_id'|'staff_name'|'signed_on'|'authorization_date'|'collateral_description'|'document_requirements'|'sales_staff_id'|'tls_staff_id'|'ownership_term_months'>;
export const PROFILE_KEYS = ['customer','relatives','staff_id','staff_name','signed_on','authorization_date','collateral_description','document_requirements','sales_staff_id','tls_staff_id','ownership_term_months'] as const;
export function contractProfile(draft:ContractDraft):ContractProfile {
  return Object.fromEntries(PROFILE_KEYS.filter(key=>draft[key] !== undefined).map(key=>[key,draft[key]])) as unknown as ContractProfile;
}
export async function saveContractProfile(id:number,revision:string,profile:ContractProfile) {
  const response=await fetch(`/api/auth/order/car-rental/${id}/profile`,{method:'PATCH',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,profile})});
  const result=await response.json().catch(()=>null);
  if(!response.ok || result?.status !== 'success' || typeof result.data?.revision !== 'string')throw new Error(result?.message || 'Chưa lưu được hồ sơ hợp đồng.');
  return result.data as {revision:string};
}
