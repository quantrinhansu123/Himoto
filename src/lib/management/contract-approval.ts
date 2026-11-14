import { requiresOwnershipApproval, type OwnershipApprovalState } from '../../../shared/contract-approval';
export { requiresOwnershipApproval, canApproveOwnershipContract, canFinalizeRentalContract, type OwnershipApprovalState } from '../../../shared/contract-approval';
import { isOwnershipCustomerSourceStore } from './contract-billing';

export function isOwnershipApprovalContract(row:Record<string,unknown>) {
  return requiresOwnershipApproval(row.rental_type)||isOwnershipCustomerSourceStore({kind:row.store_kind,store_name:row.store_name});
}

export async function ownershipApprovalRequest(id:number,revision?:string,signal?:AbortSignal):Promise<OwnershipApprovalState> {
  const response=await fetch(`/api/auth/order/car-rental/${id}/approval`,{method:revision?'PATCH':'GET',credentials:'same-origin',cache:'no-store',signal,
    ...(revision?{headers:{'Content-Type':'application/json'},body:JSON.stringify({revision})}:{})});
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.status!=='success')throw new Error(result?.message||'Chưa tải được thông tin duyệt hợp đồng.');
  return result.data;
}

