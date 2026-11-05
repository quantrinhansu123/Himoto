import { hasPermission, isAdminAccount, type PermissionAccount } from './access-permissions';

export const OWNERSHIP_CONTRACT_TYPES = new Set(['ownership', 'ownership_cd']);
export const requiresOwnershipApproval = (rentalType: unknown) => OWNERSHIP_CONTRACT_TYPES.has(String(rentalType));
export function canApproveOwnershipContract(account: PermissionAccount | null | undefined) {
  return hasPermission(account, 'contracts.finalize') && (isAdminAccount(account) || account?.access_role === 'ownership_manager' || account?.access_role === 'branch_manager');
}
export function canFinalizeRentalContract(account: PermissionAccount | null | undefined, rentalType: unknown) {
  return hasPermission(account, 'contracts.finalize') && (!requiresOwnershipApproval(rentalType) || canApproveOwnershipContract(account));
}
export interface OwnershipApprovalState {
  id: number; code: string; revision: string; status: string; customer_name: string; store_name: string; rental_type: string;
  total_amount: number | null; deposit_amount: number | null; approved_at: string | null; approved_by: string | null; can_approve: boolean;
}
