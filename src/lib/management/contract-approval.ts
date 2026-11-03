import { OWNERSHIP_CONTRACT_TYPES } from './config';
import { hasPermission,isAdminAccount,type PermissionAccount } from './permissions';
import { isOwnershipCustomerSourceStore } from './contract-billing';

export const requiresOwnershipApproval=(rentalType:unknown)=>OWNERSHIP_CONTRACT_TYPES.has(String(rentalType));
export function isOwnershipApprovalContract(row:Record<string,unknown>) {
  return requiresOwnershipApproval(row.rental_type)||isOwnershipCustomerSourceStore({kind:row.store_kind,store_name:row.store_name});
}

export interface OwnershipApprovalState {
  id:number;code:string;revision:string;status:string;customer_name:string;store_name:string;rental_type:string;
  total_amount:number|null;deposit_amount:number|null;approved_at:string|null;approved_by:string|null;can_approve:boolean;
}
export async function ownershipApprovalRequest(id:number,revision?:string,signal?:AbortSignal):Promise<OwnershipApprovalState> {
  const response=await fetch(`/api/auth/order/car-rental/${id}/approval`,{method:revision?'PATCH':'GET',credentials:'same-origin',cache:'no-store',signal,
    ...(revision?{headers:{'Content-Type':'application/json'},body:JSON.stringify({revision})}:{})});
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.status!=='success')throw new Error(result?.message||'Chưa tải được thông tin duyệt hợp đồng.');
  return result.data;
}

export function canApproveOwnershipContract(account:PermissionAccount|null|undefined) {
  return hasPermission(account,'contracts.finalize')&&(isAdminAccount(account)||account?.access_role==='ownership_manager'||account?.access_role==='branch_manager');
}

export function canFinalizeRentalContract(account:PermissionAccount|null|undefined,rentalType:unknown) {
  return hasPermission(account,'contracts.finalize')&&(!requiresOwnershipApproval(rentalType)||canApproveOwnershipContract(account));
}
