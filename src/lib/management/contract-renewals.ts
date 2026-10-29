import type { PaymentMethod, PaymentResult } from './contract-payments';

export interface RenewalInput {
  occurred_at?:string;
  item_id: number; item_revision: string; order_revision: string;
  return_at: string; amount: string; note: string;
  /** Cash collected beside the contract. Not added to the contract total. */
  outside_amount?: string;
  outside_name?: string;
  /** Suggested fee from contract unit price × duration; mismatch still saves with a warning. */
  expected_amount?: string;
  request_id?: string;
  receipt?: { method: PaymentMethod; account_id: number; paid_at: string };
}
export interface RenewalVersion {
  occurred_at?:string;
  version: number; kind: 'renewal'; created_at: string; actor_id: number;
  item_id: number; vehicle_id: number; vehicle_name: string; license: string;
  rent_at: string | null; before_return_at: string | null; return_at: string; overdue_minutes: number;
  amount: number; before_total: number | null; total: number | null; paid: number | null; note: string;
  outside_amount?: number; outside_name?: string;
  expected_amount?: number; amount_mismatch?: boolean; warning?: string;
  request_id?: string; request_hash?: string;
}
export interface RenewalResult { order_id: number; code: string; version: number; return_at: string; total_amount: number | null; amount: number; outside_amount?: number; outside_collected?: boolean; payment?: PaymentResult; replayed?: boolean }

/** Original contract is v1; renewals start at v2. Ignore non-renewal junk and coerce string version ids from older payloads. */
export function nextRenewalVersion(versions: unknown): number {
  const list = Array.isArray(versions) ? versions : [];
  let max = 1;
  for (const item of list) {
    if (!item || typeof item !== 'object' || (item as { kind?: unknown }).kind !== 'renewal') continue;
    const n = Number((item as { version?: unknown }).version);
    if (Number.isSafeInteger(n) && n > max) max = n;
  }
  return max + 1;
}
export function hasRenewalVersion(versions: unknown, version: number): boolean {
  if (!Array.isArray(versions) || !Number.isSafeInteger(version) || version < 2) return false;
  return versions.some(item => item && typeof item === 'object' && (item as { kind?: unknown }).kind === 'renewal'
    && Number((item as { version?: unknown }).version) === version);
}

function renewalTime(value: string) {
  return Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+07:00` : value);
}
export function renewalDurationUnits(before: string, after: string, unit: 'day' | 'hour' = 'day'): number | null {
  const minutes = Math.ceil((renewalTime(after) - renewalTime(before)) / 60_000);
  return Number.isFinite(minutes) && minutes > 0 ? Math.ceil(minutes / (unit === 'day' ? 1440 : 60)) : null;
}
export function renewalFeeWarning(actual: number, expected: number | null): string {
  if (expected === null || actual >= expected) return '';
  const money = (amount: number) => `${amount.toLocaleString('vi-VN')} đ`;
  return `Cảnh báo thu thấp hơn gợi ý: phí gia hạn ${money(actual)}, gợi ý ${money(expected)}, chênh thiếu ${money(expected - actual)}. Kiểm tra lại số ngày và thỏa thuận với khách trước khi lưu.`;
}

export function overdueParts(returnAt: string | null, now = Date.now()) {
  const due = returnAt ? new Date(returnAt).getTime() : NaN;
  const minutes = Number.isFinite(due) ? Math.max(0, Math.floor((now - due) / 60_000)) : 0;
  return { minutes, days: Math.floor(minutes / 1440), hours: Math.ceil((minutes % 1440) / 60) };
}

export async function saveContractRenewal(orderId: number, input: RenewalInput): Promise<RenewalResult> {
  const response = await fetch(`/api/auth/order/car-rental/${orderId}/renewals`, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== 'success' || !Number.isSafeInteger(result?.data?.version)) throw new Error(result?.message || `Không lưu được gia hạn (HTTP ${response.status}).`);
  return result.data as RenewalResult;
}
