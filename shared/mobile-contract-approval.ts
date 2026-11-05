import type { MobileWriteReceipt } from './mobile-contract';
import type { OwnershipApprovalState } from './contract-approval';

export interface MobileContractApprovalContext { id: number; approval: OwnershipApprovalState | null }
export interface MobileContractApprovalResult {
  key: string; operation: string; receipt: MobileWriteReceipt; approval: OwnershipApprovalState | null;
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const revision = (value: unknown) => typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value);
const amount = (value: unknown) => value === null || typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
export function isOwnershipApprovalState(value: unknown): value is OwnershipApprovalState {
  if (!object(value)) return false;
  return id(value.id) && revision(value.revision) && ['code', 'status', 'customer_name', 'store_name', 'rental_type'].every(key => typeof value[key] === 'string') &&
    amount(value.total_amount) && amount(value.deposit_amount) && typeof value.can_approve === 'boolean' &&
    (value.approved_at === null || typeof value.approved_at === 'string' && Number.isFinite(Date.parse(value.approved_at))) &&
    (value.approved_by === null || typeof value.approved_by === 'string');
}
export function isMobileContractApprovalContext(value: unknown): value is MobileContractApprovalContext {
  return object(value) && id(value.id) && (value.approval === null || isOwnershipApprovalState(value.approval) && value.approval.id === value.id);
}
export function isMobileContractApprovalResult(value: unknown): value is MobileContractApprovalResult {
  return object(value) && typeof value.key === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.key) &&
    object(value.receipt) && id(value.receipt.id) && revision(value.receipt.revision) && typeof value.receipt.replayed === 'boolean' &&
    value.operation === `contract.approve:${value.receipt.id}` && (value.approval === null || isOwnershipApprovalState(value.approval) && value.approval.id === value.receipt.id);
}
