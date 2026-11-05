import type { MobileWriteReceipt } from './mobile-contract';
import type { MobileReturnPreviewInput } from './mobile-returns';
import type { MobileReturnSettlement } from './mobile-return-settlement';
import type { MobileCorrectionAccount } from './mobile-contract-corrections';
import { validDraftTime } from './mobile-draft-validation';
export interface MobileReturnCorrectionOptions { id: number; code: string; page: number; pages: number; total: number; rows: { itemId: number; vehicleId: number; license: string; name: string; returnedAt: string }[] }
export interface MobileReturnCorrectionProfile {
  id: number; anchorItemId: number; code: string; customer: string; revision: string; eventKey: string; note: string; blockedReason: string | null;
  previousAdjustment: number; totalAmount: number | null; rentalPaid: number | null; depositHeld: number; billing: boolean;
  lines: { id: number; vehicleId: number; revision: string; license: string; name: string; startsAt: string | null; scheduledReturnAt: string | null; returnedAt: string; reconciled: boolean; lateFee: number; repairFee: number; repairNote: string; earlyDiscount: number; hourlyRate: number }[];
  accounts: MobileCorrectionAccount[]; settlement: MobileReturnSettlement & { revision: string };
}
export interface MobileReturnCorrectionInput { item_id: number; revision: string; reason: string; note: string; items: MobileReturnPreviewInput['items']; settlement: MobileReturnSettlement & { revision: string } }
export interface MobileReturnCorrectionResult { key: string; operation: string; receipt: MobileWriteReceipt }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const revision = (v: unknown) => typeof v === 'string' && /^[1-9]\d{0,19}$/.test(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length <= 4000;
const stamp = (v: unknown) => text(v) && Number.isFinite(Date.parse(v));
const method = (v: unknown) => ['cash', 'transfer', 'company_transfer'].includes(String(v));
const amount = (v: unknown) => v === null || nonnegative(v);
function payment(v: unknown, refund = false) {
  return object(v) && Object.keys(v).every(k => ['amount', 'method', 'account_id', 'paid_at', ...(refund ? ['recipient_bank', 'recipient_account', 'recipient_name'] : ['kind'])].includes(k)) && typeof v.amount === 'string' && /^\d{1,13}$/.test(v.amount) && method(v.method) && nonnegative(v.account_id) && validDraftTime(v.paid_at) &&
    (refund ? ['recipient_bank', 'recipient_account', 'recipient_name'].every(k => v[k] === undefined || typeof v[k] === 'string' && v[k].length <= 150) : ['late_fee', 'repair_fee', 'rental_debt'].includes(String(v.kind)));
}
function settlement(v: unknown) {
  return object(v) && revision(v.revision) && Array.isArray(v.receipts) && v.receipts.length <= 50 && v.receipts.every(r => payment(r)) &&
    (v.refund === undefined || payment(v.refund, true)) && (v.rental_refund === undefined || payment(v.rental_refund, true)) && (v.refund_deferred === undefined || v.refund_deferred === true && v.refund === undefined) &&
    (v.refund_recipient === undefined || v.refund_deferred === true && object(v.refund_recipient) && Object.entries(v.refund_recipient).every(([k, value]) => ['bank', 'account', 'name'].includes(k) && typeof value === 'string' && value.length <= 150));
}
export function isMobileReturnCorrectionOptions(v: unknown): v is MobileReturnCorrectionOptions {
  return object(v) && id(v.id) && text(v.code) && id(v.page) && id(v.pages) && v.page <= v.pages && nonnegative(v.total) && v.pages === Math.max(1, Math.ceil(v.total / 25)) && Array.isArray(v.rows) && v.rows.length === Math.max(0, Math.min(25, v.total - (v.page - 1) * 25)) &&
    v.rows.every(r => object(r) && id(r.itemId) && id(r.vehicleId) && text(r.license) && text(r.name) && stamp(r.returnedAt)) && new Set(v.rows.map(r => r.itemId)).size === v.rows.length;
}
export function isMobileReturnCorrectionProfile(v: unknown): v is MobileReturnCorrectionProfile {
  return object(v) && id(v.id) && id(v.anchorItemId) && typeof v.revision === 'string' && /^[a-f0-9]{64}$/.test(v.revision) && ['code', 'customer', 'eventKey', 'note'].every(k => text(v[k])) &&
    (v.blockedReason === null || text(v.blockedReason)) && typeof v.previousAdjustment === 'number' && Number.isSafeInteger(v.previousAdjustment) && amount(v.totalAmount) && amount(v.rentalPaid) && nonnegative(v.depositHeld) && typeof v.billing === 'boolean' &&
    Array.isArray(v.lines) && v.lines.length > 0 && v.lines.length <= 50 && v.lines.every(l => object(l) && id(l.id) && id(l.vehicleId) && revision(l.revision) && text(l.license) && text(l.name) && (l.startsAt === null || stamp(l.startsAt)) && (l.scheduledReturnAt === null || stamp(l.scheduledReturnAt)) && stamp(l.returnedAt) && typeof l.reconciled === 'boolean' && text(l.repairNote) && ['lateFee', 'repairFee', 'earlyDiscount', 'hourlyRate'].every(k => nonnegative(l[k]))) && v.lines.some(l => l.id === v.anchorItemId) && new Set(v.lines.map(l => l.id)).size === v.lines.length &&
    Array.isArray(v.accounts) && v.accounts.every(a => object(a) && id(a.id) && method(a.method) && text(a.label)) && new Set(v.accounts.map(a => `${a.method}:${a.id}`)).size === v.accounts.length && settlement(v.settlement);
}
export function isMobileReturnCorrectionResult(v: unknown): v is MobileReturnCorrectionResult {
  return object(v) && typeof v.key === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.key) && object(v.receipt) && id(v.receipt.id) && revision(v.receipt.revision) && typeof v.receipt.replayed === 'boolean' && v.operation === `return.correct:${v.receipt.id}`;
}
