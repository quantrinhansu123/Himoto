export interface ReturnableContractItem {
  item_id: number; order_id: number; contract_code: string; order_status: string; customer_name: string;
  customer_id_card: string; vehicle_id: number; vehicle_name: string; license: string; store_id: number;
  store_name: string; scheduled_start_at: string | null; scheduled_return_at: string | null; completed_at: string | null; item_revision: string; order_revision: string;
  total_amount: number | null; paid_amount: number | null; overdue: boolean;
}
export interface ReturnInput { item_id: number; item_revision: string; returned_at: string; hourly_rate: string; fee_override?: string }
export interface ReturnResult { item_id: number; contract_code: string; returned_at: string; scheduled_return_at: string; late_minutes: number; chargeable_hours: number; hourly_rate: number; fee: number; total_amount: number | null; status: string }
export class ContractReturnRequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
async function returnRequest<T>(path: string, input?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method: input ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal,
    headers: { Accept: 'application/json', ...(input ? { 'Content-Type': 'application/json' } : {}) }, ...(input ? { body: JSON.stringify(input) } : {}) });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== 'success') throw new Error(result?.message || `Không thực hiện được thao tác trả xe (HTTP ${response.status}).`);
  return result.data as T;
}
export function searchReturnableItems(query: string, signal?: AbortSignal) {
  return returnRequest<ReturnableContractItem[]>(`/api/auth/returns?${new URLSearchParams({ query })}`, undefined, signal);
}
export function loadContractReturnableItems(orderId: number, signal?: AbortSignal) {
  return returnRequest<ReturnableContractItem[]>(`/api/auth/returns?${new URLSearchParams({ order_id: String(orderId) })}`, undefined, signal);
}
export function returnContractItem(input: ReturnInput) {
  return returnRequest<ReturnResult>('/api/auth/returns', input);
}
export function changeContractVehicle(input: { item_id: number; item_revision: string; vehicle_id: number }) {
  return returnRequest<{ item_id: number; old_license: string; new_license: string }>('/api/auth/returns/vehicle', input);
}
