import type { PaymentMethod } from './contract-payments';

export interface FinalizeReceipt { method: PaymentMethod; account_id: number }
export interface FinalizeCollection extends FinalizeReceipt { purpose: 'deposit' | 'rental'; amount: string; paid_at: string }
export type FinalizeInput = { revision: string; paid_at: string; deposit: FinalizeReceipt | null; rental: FinalizeReceipt | null; acknowledge_reservation_overlap?: true }
  | { revision: string; receipts: FinalizeCollection[]; reservation?: true; acknowledge_reservation_overlap?: true };
export interface FinalizeResult { order_id: number; code: string; total_amount: number; deposit_amount: number; paid_amount: number; transaction_ids: number[]; status?: 'renting' | 'deposit_contract' }
export class FinalizeOverlapError extends Error {
  readonly code = 'reservation_overlap' as const;
  constructor(message: string) { super(message); }
}

/** Balance only the automatic row; editing it manually opts into a partial payment. */
export function balanceCollectionAmounts<T extends { amount: string; automatic?: boolean }>(rows: T[], due: number): T[] {
  const target = rows.findIndex(row => row.automatic);
  if (target < 0) return rows;
  const others = rows.filter((_, index) => index !== target);
  const ready = others.every(row => /^[1-9]\d{0,12}$/.test(row.amount) && Number.isSafeInteger(Number(row.amount)));
  const amount = ready ? String(Math.max(due - others.reduce((sum, row) => sum + Number(row.amount), 0), 0)) : '';
  return rows.map((row, index) => index === target ? { ...row, amount } : row);
}

/** Picker labels plus SQL/history aliases so CK never collapses to cash. */
const METHOD_BY_LABEL: Record<string, PaymentMethod> = {
  'Tiền mặt': 'cash',
  'CK tk cá nhân': 'transfer',
  'CK TK cá nhân': 'transfer',
  'CK tài khoản cá nhân': 'transfer',
  'Chuyển khoản': 'transfer',
  'Chuyển khoản (chưa phân loại TK)': 'transfer',
  'CK tk công ty': 'company_transfer',
  'CK TK công ty': 'company_transfer',
  'CK tài khoản công ty': 'company_transfer',
};
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Tiền mặt',
  transfer: 'CK tk cá nhân',
  company_transfer: 'CK tk công ty',
};
/** Prefer bank transfer before cash so empty drafts do not silently book everything as Tiền mặt. */
export const PAYMENT_METHOD_FALLBACK: PaymentMethod[] = ['transfer', 'company_transfer', 'cash'];
export function draftPaymentMethod(value: string): PaymentMethod {
  const first = value.split(',').map(item => item.trim()).find(item => METHOD_BY_LABEL[item]);
  return first ? METHOD_BY_LABEL[first] : 'transfer';
}
export function draftPaymentMethods(value: string): PaymentMethod[] {
  return [...new Set(value.split(',').map(item => METHOD_BY_LABEL[item.trim()]).filter(Boolean))];
}

export async function finalizeContract(orderId: number, input: FinalizeInput): Promise<FinalizeResult> {
  const response = await fetch(`/api/auth/order/car-rental/${orderId}/finalize`, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== 'success' || typeof result?.data?.code !== 'string') {
    if (result?.code === 'reservation_overlap') throw new FinalizeOverlapError(result?.message || 'Xe đã có cọc giữ chồng lịch.');
    throw new Error(result?.message || `Không lưu chính thức được hợp đồng (HTTP ${response.status}).`);
  }
  return result.data as FinalizeResult;
}
