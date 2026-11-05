import type { MobileCollectionMethod, MobileWriteReceipt } from './mobile-contract';
export type MobileCorrectionKind = 'receipts' | 'renewal';
export interface MobileCorrectionAccount { id: number; method: MobileCollectionMethod; label: string }
export interface MobileReceiptSplit { amount: string; method: MobileCollectionMethod; account_id: number }
export interface MobileEditableReceipt { id: number; revision: string; deposit: boolean; paid_at: string; parts: MobileReceiptSplit[] }
export interface MobileReceiptCorrections { id: number; code: string; revision: string; depositAmount: string; accounts: MobileCorrectionAccount[]; receipts: MobileEditableReceipt[] }
export interface MobileReceiptCorrectionInput { revision: string; deposit_amount: string; reason: string; receipts: MobileEditableReceipt[] }
export interface MobileRenewalCorrectionReceipt {
  id: number; revision: string; status: 'approved' | 'cancelled'; collectedAmount: number; paidAt: string;
  method: MobileCollectionMethod | null; accountId: number | null; account: string; feeEditable: boolean;
  amount: number | null; beforeReturnAt: string | null; returnAt: string | null; version: number | null; license: string; vehicleName: string;
}
export interface MobileRenewalCorrections { id: number; code: string; revision: string; status: string; totalAmount: number | null; rentalPaid: number | null; accounts: MobileCorrectionAccount[]; receipts: MobileRenewalCorrectionReceipt[] }
export interface MobileRenewalCorrectionInput { transaction_id: number; revision: string; reason: string; method?: MobileCollectionMethod; account_id?: number; before_return_at?: string; return_at?: string; amount?: string; paid_at?: string; collected_amount?: string }
export interface MobileContractCorrectionResult { key: string; operation: string; receipt: MobileWriteReceipt }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const revision = (v: unknown) => typeof v === 'string' && /^[1-9]\d{0,19}$/.test(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length <= 4000;
const stamp = (v: unknown) => text(v) && Number.isFinite(Date.parse(v));
const method = (v: unknown) => ['cash', 'transfer', 'company_transfer'].includes(String(v));
const amount = (v: unknown) => v === null || nonnegative(v);
const accounts = (v: unknown) => Array.isArray(v) && v.length <= 10000 && v.every(a => object(a) && id(a.id) && method(a.method) && text(a.label)) && new Set(v.map(a => `${a.method}:${a.id}`)).size === v.length;
export function isMobileReceiptCorrections(v: unknown): v is MobileReceiptCorrections {
  return object(v) && id(v.id) && text(v.code) && revision(v.revision) && typeof v.depositAmount === 'string' && /^\d{1,13}$/.test(v.depositAmount) && accounts(v.accounts) && Array.isArray(v.receipts) &&
    v.receipts.every(r => object(r) && id(r.id) && revision(r.revision) && typeof r.deposit === 'boolean' && stamp(r.paid_at) && Array.isArray(r.parts) && r.parts.length > 0 && r.parts.length <= 10 && r.parts.every(p => object(p) && typeof p.amount === 'string' && /^\d{1,13}$/.test(p.amount) && method(p.method) && nonnegative(p.account_id))) && new Set(v.receipts.map(r => r.id)).size === v.receipts.length;
}
export function isMobileRenewalCorrections(v: unknown): v is MobileRenewalCorrections {
  return object(v) && id(v.id) && text(v.code) && revision(v.revision) && text(v.status) && amount(v.totalAmount) && amount(v.rentalPaid) && accounts(v.accounts) && Array.isArray(v.receipts) && v.receipts.every(r => object(r) &&
    id(r.id) && revision(r.revision) && ['approved', 'cancelled'].includes(String(r.status)) && nonnegative(r.collectedAmount) && stamp(r.paidAt) && (r.method === null || method(r.method)) && (r.accountId === null || id(r.accountId)) && text(r.account) && typeof r.feeEditable === 'boolean' && amount(r.amount) && (r.beforeReturnAt === null || stamp(r.beforeReturnAt)) && (r.returnAt === null || stamp(r.returnAt)) && (r.version === null || id(r.version)) && text(r.license) && text(r.vehicleName)) && new Set(v.receipts.map(r => r.id)).size === v.receipts.length;
}
export function isMobileContractCorrectionResult(v: unknown): v is MobileContractCorrectionResult {
  if (!object(v) || typeof v.key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.key) || !object(v.receipt)) return false;
  const receipt = v.receipt;
  return id(receipt.id) && revision(receipt.revision) && typeof receipt.replayed === 'boolean' && ['receipts', 'renewal'].some(kind => v.operation === `correction.${kind}:${receipt.id}`);
}
