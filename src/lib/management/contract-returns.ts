export interface ReturnableContractItem {
  item_id: number; order_id: number; contract_code: string; order_status: string; customer_name: string;
  customer_id_card: string; vehicle_id: number; vehicle_name: string; license: string; store_id: number;
  store_name: string; scheduled_start_at: string | null; scheduled_return_at: string | null; completed_at: string | null; item_revision: string; order_revision: string;
  total_amount: number | null; paid_amount: number | null; overdue: boolean; daily_price: number | null;
  deposit_paid: number; deposit_held: number;
  return_reconciled?: boolean;
}
export interface ReturnInput { item_id: number; item_revision: string; returned_at: string; hourly_rate: string; fee_override?: string; early_discount?: string;repair_fee?:string;repair_note?:string }
export interface ReturnResult { item_id: number; contract_code: string; returned_at: string; scheduled_return_at: string; late_minutes: number; chargeable_hours: number; hourly_rate: number; fee: number;late_fee?:number;repair_fee?:number; total_amount: number | null; status: string }
export interface BadDebtRecoveryInput {item_id:number;item_revision:string;request_id:string;recovered_at:string;note:string}
export interface BadDebtRecoveryResult {item_id:number;order_id:number;vehicle_id:number;recovered_at:string;replayed:boolean}
export interface ReturnReceipt {kind:'late_fee'|'repair_fee'|'rental_debt';request_id:string;amount:string;method:import('./contract-payments').PaymentMethod;account_id:number;paid_at:string}
export type ReturnRefund=Omit<ReturnReceipt,'kind'>&{recipient_bank?:string;recipient_account?:string;recipient_name?:string};
export interface ReturnSettlement {order_id:number;revision:string;receipts:ReturnReceipt[];refund_deferred?:true;refund_recipient?:{bank?:string;account?:string;name?:string};refund?:ReturnRefund;rental_refund?:ReturnRefund}
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
export function loadContractReturnableItems(orderId: number, signal?: AbortSignal, recovery=false) {
  return returnRequest<ReturnableContractItem[]>(`/api/auth/returns?${new URLSearchParams({ order_id: String(orderId),...(recovery?{recovery:'1'}:{}) })}`, undefined, signal);
}
export function returnContractItem(input: ReturnInput) {
  return returnRequest<ReturnResult>('/api/auth/returns', input);
}
export function returnContractItems(items: ReturnInput[],settlements?:ReturnSettlement[]) {
  return returnRequest<ReturnResult[]>('/api/auth/returns', { items,...(settlements?.length?{settlements}:{}) });
}
export function changeContractVehicle(input: { item_id: number; item_revision: string; vehicle_id: number }) {
  return returnRequest<{ item_id: number; order_id: number; swap_id: number; old_license: string; new_license: string }>('/api/auth/returns/vehicle', input);
}
export function recoverBadDebtVehicle(input:BadDebtRecoveryInput) {
  return returnRequest<BadDebtRecoveryResult>('/api/auth/returns/recover',input);
}
