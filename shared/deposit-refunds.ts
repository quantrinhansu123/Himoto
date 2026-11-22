import type { PaymentMethod } from './payment-methods';
import { validDraftTime } from './mobile-draft-validation';

export interface DepositRefundRequest {
  id: string;
  order_id: number;
  item_id: number;
  code: string;
  store: string;
  actor_id: number;
  actor: string;
  reviewer: string;
  status: 'pending' | 'posted' | 'approved' | 'rejected';
  amount: number;
  method: PaymentMethod;
  account_label: string;
  paid_at: string;
  reason: string;
  review_reason: string;
  review_note: string;
  replaces_id: number | null;
  transaction_id: number | null;
}

export interface DepositRefundState {
  code: string;
  held: number;
  can_submit: boolean;
  can_send_telegram: boolean;
  blocked_reason: string;
  review_reason: string;
  accounts: { id: number; method: PaymentMethod; label: string }[];
  vouchers: { id: number; revision: string; amount: number; paid_at: string; method: string; account: string }[];
  requests: DepositRefundRequest[];
}

export interface DepositRefundQueuePage {
  rows: DepositRefundRequest[];
  has_more: boolean;
}

export type DepositRefundDecision = 'approve' | 'reject';

export const depositRefundStatus: Record<DepositRefundRequest['status'], string> = {
  pending: 'Chờ kế toán duyệt',
  posted: 'Đã ghi phiếu chi',
  approved: 'Kế toán đã duyệt',
  rejected: 'Kế toán đã từ chối',
};

export const isDepositRefundRequestId = (value: unknown): value is string =>
  typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value);

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;
const amount = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const method = (value: unknown) => value === 'cash' || value === 'transfer' || value === 'company_transfer';
const text = (value: unknown) => typeof value === 'string';

export function isDepositRefundRequest(value: unknown): value is DepositRefundRequest {
  return object(value) && isDepositRefundRequestId(value.id) && id(value.order_id) && id(value.item_id) && id(value.actor_id) &&
    ['pending', 'posted', 'approved', 'rejected'].some(status => status === value.status) &&
    id(value.amount) && method(value.method) && validDraftTime(value.paid_at) &&
    (value.replaces_id === null || id(value.replaces_id)) &&
    (value.status === 'posted' || value.status === 'approved' ? id(value.transaction_id) : value.transaction_id === null) &&
    ['code', 'store', 'actor', 'reviewer', 'account_label', 'reason', 'review_reason', 'review_note'].every(key => text(value[key]));
}

export function isDepositRefundState(value: unknown): value is DepositRefundState {
  return object(value) && text(value.code) && amount(value.held) &&
    typeof value.can_submit === 'boolean' && typeof value.can_send_telegram === 'boolean' &&
    text(value.blocked_reason) && text(value.review_reason) &&
    Array.isArray(value.accounts) && value.accounts.every(account =>
      object(account) && id(account.id) && method(account.method) && text(account.label)) &&
    Array.isArray(value.vouchers) && value.vouchers.every(voucher =>
      object(voucher) && id(voucher.id) && id(voucher.amount) &&
      typeof voucher.revision === 'string' && /^\d{1,20}$/.test(voucher.revision) &&
      typeof voucher.paid_at === 'string' && Number.isFinite(Date.parse(voucher.paid_at)) &&
      text(voucher.method) && text(voucher.account)) &&
    Array.isArray(value.requests) && value.requests.every(isDepositRefundRequest);
}

export function isDepositRefundQueuePage(value: unknown): value is DepositRefundQueuePage {
  return object(value) && typeof value.has_more === 'boolean' &&
    Array.isArray(value.rows) && value.rows.length <= 25 &&
    value.rows.every(row => isDepositRefundRequest(row) && row.status === 'pending');
}
