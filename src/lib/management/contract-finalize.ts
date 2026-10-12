import type { PaymentMethod } from './contract-payments';

export interface FinalizeReceipt { method: PaymentMethod; account_id: number }
export interface FinalizeCollection extends FinalizeReceipt { purpose: 'deposit' | 'rental'; amount: string; paid_at: string }
export type FinalizeInput = { revision: string; paid_at: string; deposit: FinalizeReceipt | null; rental: FinalizeReceipt | null } | { revision: string; receipts: FinalizeCollection[]; reservation?: true };
export interface FinalizeResult { order_id: number; code: string; total_amount: number; deposit_amount: number; paid_amount: number; transaction_ids: number[]; status?: 'renting' | 'deposit_contract' }

const METHOD_BY_LABEL: Record<string, PaymentMethod> = { 'Tiền mặt': 'cash', 'CK tk cá nhân': 'transfer', 'CK tk công ty': 'company_transfer' };
export function draftPaymentMethod(value: string): PaymentMethod {
  const first = value.split(',').map(item => item.trim()).find(item => METHOD_BY_LABEL[item]);
  return first ? METHOD_BY_LABEL[first] : 'cash';
}
export function draftPaymentMethods(value: string): PaymentMethod[] {
  const methods = [...new Set(value.split(',').map(item=>METHOD_BY_LABEL[item.trim()]).filter(Boolean))];
  return methods.length ? methods : ['cash'];
}

export async function finalizeContract(orderId: number, input: FinalizeInput): Promise<FinalizeResult> {
  const response = await fetch(`/api/auth/order/car-rental/${orderId}/finalize`, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== 'success' || typeof result?.data?.code !== 'string') throw new Error(result?.message || `Không lưu chính thức được hợp đồng (HTTP ${response.status}).`);
  return result.data as FinalizeResult;
}
