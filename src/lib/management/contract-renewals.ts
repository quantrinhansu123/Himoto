export interface RenewalInput {
  item_id: number; item_revision: string; order_revision: string;
  return_at: string; amount: string; note: string;
}
export interface RenewalVersion {
  version: number; kind: 'renewal'; created_at: string; actor_id: number;
  item_id: number; vehicle_id: number; vehicle_name: string; license: string;
  rent_at: string | null; before_return_at: string | null; return_at: string; overdue_minutes: number;
  amount: number; before_total: number | null; total: number | null; paid: number | null; note: string;
}
export interface RenewalResult { order_id: number; code: string; version: number; return_at: string; total_amount: number | null; amount: number }

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
