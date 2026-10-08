export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'transfer', label: 'Chuyển khoản' },
  { value: 'company_transfer', label: 'CK tài khoản công ty' },
] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number]['value'];
export const PAYABLE_STATUSES = ['renting', 'overdue', 'wait_payment', 'bad_debt'];
export const RENEWABLE_STATUSES = ['renting', 'overdue'];
export const MAX_PAYMENT_AMOUNT = 9_999_999_999_999;
export interface PaymentAccount { id: number; label: string; kind: 'cash' | 'bank'; store_id: number; owner_type: string }
export interface ContractPayment {
  id: number; amount: number; paid_at: string; method: string; account: string;
  note: string; actor: string;
  renewal?: { license: string; vehicle_name: string; before_return_at: string; return_at: string } | null;
}
export interface RenewalItem {
  id: number; vehicle_id: number; name: string; license: string; revision: string;
  return_at: string | null; renewal_amount: number | null;
}
export interface PaymentContext {
  id: number; code: string; status: string; store_id: number; revision: string;
  total_amount: number | null; paid_amount: number | null; remaining: number | null;
  company_paid_amount: number; company_payment_count: number;
  accounts: PaymentAccount[]; history: ContractPayment[];
  items: RenewalItem[]; end_date: string | null;
}
export interface PaymentInput {
  request_id: string; revision: string; amount: string; method: PaymentMethod; account_id: number; paid_at: string; note: string;
  purpose?: 'renewal'; item_id?: number; item_revision?: string; return_at?: string;
}
export interface PaymentResult { context: PaymentContext; transaction_id: number; replayed: boolean; company_transfer: boolean }
export class PaymentRequestError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}
export function paymentAccounts(context: PaymentContext, method: PaymentMethod) {
  return context.accounts.filter(account => method === 'cash' ? account.kind === 'cash' && account.store_id === context.store_id
    : method === 'company_transfer' ? account.kind === 'bank' && account.owner_type === 'company'
      : account.kind === 'bank' && account.owner_type !== 'company' && account.store_id === context.store_id);
}
export function vietnamPaymentTime(now = new Date()) {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
async function paymentRequest<T>(id: number, input?: PaymentInput, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/auth/order/car-rental/${id}/payments`, {
    method: input ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal,
    headers: { Accept: 'application/json', ...(input ? { 'Content-Type': 'application/json' } : {}) },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new PaymentRequestError(result?.message || 'Chưa xác nhận được thanh toán. Kiểm tra lịch sử trước khi thử lại.', response.status);
  const context = input ? result?.data?.context : result?.data;
  if (result?.status !== 'success' || context?.id !== id || typeof context?.revision !== 'string' || !/^\d+$/.test(context.revision) ||
      !Array.isArray(context?.accounts) || !Array.isArray(context?.history) || !Array.isArray(context?.items) ||
      ![context?.total_amount, context?.paid_amount, context?.remaining].every(value => value === null || (Number.isSafeInteger(value) && value >= 0)) ||
      (input && (!Number.isSafeInteger(result?.data?.transaction_id) || result.data.transaction_id <= 0 || typeof result.data.replayed !== 'boolean' || result.data.company_transfer !== (input.method === 'company_transfer')))) throw new PaymentRequestError('Kết quả thanh toán chưa hợp lệ. Kiểm tra lịch sử trước khi thử lại.');
  return result.data as T;
}
export const loadPaymentContext = (id: number, signal?: AbortSignal) => paymentRequest<PaymentContext>(id, undefined, signal);
export const saveContractPayment = (id: number, input: PaymentInput) => paymentRequest<PaymentResult>(id, input);
