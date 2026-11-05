import type { MobileWriteReceipt } from './mobile-contract';
import { validDraftTime } from './mobile-draft-validation';
export interface MobileRentalTermsItem { id: number; revision: string; vehicle_id: number; license: string; start_at: string; end_at: string; unit_price: number | null; completed_at: string | null }
export interface MobileRentalTerms { id: number; code: string; revision: string; total_amount: number; paid_amount: number | null; items: MobileRentalTermsItem[] }
export interface MobileRentalTermsInput { revision: string; item_id: number; item_revision: string; start_at: string; end_at: string; unit_price: string; total_amount: string; reason: string }
export interface MobileRentalTermsResult { key: string; operation: string; receipt: MobileWriteReceipt }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const revision = (v: unknown) => typeof v === 'string' && /^[1-9]\d{0,19}$/.test(v);
const money = (v: unknown) => v === null || typeof v === 'number' && Number.isSafeInteger(v);
export function isMobileRentalTerms(v: unknown): v is MobileRentalTerms {
  return object(v) && id(v.id) && typeof v.code === 'string' && revision(v.revision) && typeof v.total_amount === 'number' && Number.isSafeInteger(v.total_amount) && money(v.paid_amount) &&
    Array.isArray(v.items) && v.items.every(i => object(i) && id(i.id) && revision(i.revision) && id(i.vehicle_id) && typeof i.license === 'string' && (i.start_at === '' || validDraftTime(i.start_at)) && (i.end_at === '' || validDraftTime(i.end_at)) && money(i.unit_price) && (i.completed_at === null || typeof i.completed_at === 'string' && Number.isFinite(Date.parse(i.completed_at)))) && new Set(v.items.map(i => i.id)).size === v.items.length;
}
export function isMobileRentalTermsResult(v: unknown): v is MobileRentalTermsResult {
  return object(v) && typeof v.key === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.key) && object(v.receipt) && id(v.receipt.id) && revision(v.receipt.revision) && typeof v.receipt.replayed === 'boolean' && v.operation === `contract.terms:${v.receipt.id}`;
}
