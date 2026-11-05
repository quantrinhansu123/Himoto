import type { MobileContractDraft, MobileDraftInput, MobileWriteReceipt } from './mobile-contract';
import { isMobileContractDraft } from './mobile-draft-validation';

/** Common editor shape; the issued editor never impersonates a draft lifecycle. */
export interface MobileContractFormInput { draft: MobileContractDraft; rental_type: string; status: string; notes: string; revision?: string }
export interface MobileContractEditInput extends Omit<MobileDraftInput, 'status'> { status: string }
export interface MobileContractEditProfile { id: number; code: string; revision: string; input: MobileContractEditInput; rentalPaid: number | null; depositPaid: number | null }
export interface MobileContractEditResult { key: string; operation: string; receipt: MobileWriteReceipt }
export const issuedContractStatuses = ['renting', 'completed', 'pending', 'overdue', 'cancelled', 'bad_debt', 'wait_payment', 'reserved', 'deposit_contract', 'cancel_pending_settlement'] as const;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const revision = (v: unknown) => typeof v === 'string' && /^[1-9]\d{0,19}$/.test(v);
const amount = (v: unknown) => v === null || typeof v === 'number' && Number.isFinite(v);
export function isMobileContractEditProfile(v: unknown): v is MobileContractEditProfile {
  if (!object(v) || !id(v.id) || typeof v.code !== 'string' || !revision(v.revision) || !object(v.input)) return false;
  const input = v.input;
  return input.revision === v.revision && issuedContractStatuses.includes(input.status as never) &&
    typeof input.notes === 'string' && input.notes.length <= 4000 && typeof input.rental_type === 'string' &&
    isMobileContractDraft(input.draft) && amount(v.rentalPaid) && amount(v.depositPaid);
}
export function isMobileContractEditResult(v: unknown): v is MobileContractEditResult {
  return object(v) && typeof v.key === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.key) &&
    object(v.receipt) && id(v.receipt.id) && revision(v.receipt.revision) && typeof v.receipt.replayed === 'boolean' && v.operation === `contract.edit:${v.receipt.id}`;
}
