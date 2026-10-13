export const BATTERY_STATUSES = [
  { value: 'renting', label: 'Đang thuê' },
  { value: 'returned', label: 'Đã trả' },
  { value: 'cancelled', label: 'Đã hủy' },
] as const;
export type BatteryStatus = (typeof BATTERY_STATUSES)[number]['value'];
export const BATTERY_PAYMENT_METHODS = ['', 'CK', 'TM'] as const;
export type BatteryPaymentMethod = (typeof BATTERY_PAYMENT_METHODS)[number];
export const DEFAULT_BATTERY_NAME = 'Pin xe điện 2.4 của Vinfast';

export interface BatteryContractFields {
  store_id: number; customer_id: number | null; status: BatteryStatus; staff_name: string; signed_on: string; signed_place: string;
  customer_name: string; customer_phone: string; customer_address: string; customer_id_card: string; id_card_issued_on: string; id_card_issued_by: string;
  battery_name: string; vehicle_license: string; vehicle_brand: string; vehicle_type: string; vehicle_color: string; vehicle_year: string;
  /** Local Vietnam time, `YYYY-MM-DDTHH:mm`. */
  starts_at: string; ends_at: string;
  rent_price: number | null; price_unit: string; package_name: string; paid_amount: number | null; paid_method: BatteryPaymentMethod;
  deposit_amount: number | null; deposit_note: string; deposit_method: BatteryPaymentMethod; notes: string;
}
export interface BatteryContractInput extends BatteryContractFields { revision?: string; request_id?: string }
export interface BatteryContract extends BatteryContractFields {
  id: number; code: string; store_name: string; store_address: string; store_phone: string; created_at: string; revision: string;
}

export const batteryStatusLabel = (status: string) => BATTERY_STATUSES.find(option => option.value === status)?.label || status;

export class BatteryRequestError extends Error { constructor(message: string, public status = 0) { super(message); } }
export async function batteryRequest<T>(url: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method, signal, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new BatteryRequestError(result?.message || 'Không tải hoặc lưu được hợp đồng thuê pin. Tải lại trang để kiểm tra.', response.status);
  if (result?.status !== 'success' || !('data' in result)) throw new BatteryRequestError('Kết quả hợp đồng thuê pin chưa hợp lệ. Tải lại trang để kiểm tra.');
  return result.data as T;
}
