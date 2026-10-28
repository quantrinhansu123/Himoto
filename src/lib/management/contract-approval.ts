import { OWNERSHIP_CONTRACT_TYPES } from './config';
import { hasPermission,isAdminAccount,type PermissionAccount } from './permissions';

export const requiresOwnershipApproval=(rentalType:unknown)=>OWNERSHIP_CONTRACT_TYPES.has(String(rentalType));

export function canApproveOwnershipContract(account:PermissionAccount|null|undefined) {
  return hasPermission(account,'contracts.finalize')&&(isAdminAccount(account)||account?.access_role==='ownership_manager'||account?.access_role==='branch_manager');
}

export function canFinalizeRentalContract(account:PermissionAccount|null|undefined,rentalType:unknown) {
  return hasPermission(account,'contracts.finalize')&&(!requiresOwnershipApproval(rentalType)||canApproveOwnershipContract(account));
}
