import type { MobileWriteReceipt } from './mobile-contract';
export const ownershipTermChoices = [
  { value: 'custom', label: 'Chưa phân loại' }, { value: '6', label: '6 tháng' }, { value: '9', label: '9 tháng' }, { value: '12', label: '12 tháng' }, { value: '18', label: '18 tháng' }, { value: '24', label: '24 tháng' },
] as const;
export type MobileOwnershipTerm = typeof ownershipTermChoices[number]['value'];
export interface MobileOwnershipTerms { id: number; code: string; revision: string; status: string; term_months: MobileOwnershipTerm; daily_amount: number | null; can_edit: boolean }
export interface MobileOwnershipTermsInput { revision: string; term_months: MobileOwnershipTerm; daily_amount: string | null }
export interface MobileOwnershipTermsResult { key: string; operation: string; receipt: MobileWriteReceipt }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const revision = (v: unknown) => typeof v === 'string' && /^[1-9]\d{0,19}$/.test(v);
export function isMobileOwnershipTerms(v: unknown): v is MobileOwnershipTerms {
  return object(v) && id(v.id) && typeof v.code === 'string' && revision(v.revision) && typeof v.status === 'string' && typeof v.can_edit === 'boolean' && ownershipTermChoices.some(t => t.value === v.term_months) && (v.daily_amount === null || id(v.daily_amount) && v.daily_amount <= 9_999_999_999_999);
}
export function isMobileOwnershipTermsResult(v: unknown): v is MobileOwnershipTermsResult {
  return object(v) && typeof v.key === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.key) && object(v.receipt) && id(v.receipt.id) && revision(v.receipt.revision) && typeof v.receipt.replayed === 'boolean' && v.operation === `contract.ownership_terms:${v.receipt.id}`;
}
