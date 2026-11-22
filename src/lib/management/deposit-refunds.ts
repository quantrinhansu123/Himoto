import type { PaymentMethod } from './contract-payments';

export interface DepositRefundRequest {
  id: string;
  order_id: number;
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

export const depositRefundStatus: Record<DepositRefundRequest['status'], string> = {
  pending: 'Chờ kế toán duyệt',
  posted: 'Đã ghi phiếu chi',
  approved: 'Kế toán đã duyệt',
  rejected: 'Kế toán đã từ chối',
};
