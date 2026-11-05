export * from "../../../shared/battery-contracts";
export class BatteryRequestError extends Error { constructor(message: string, public status = 0) { super(message); } }
export async function batteryRequest<T>(url: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method, signal, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new BatteryRequestError(result?.message || 'Không tải hoặc lưu được hợp đồng thuê pin. Tải lại trang để kiểm tra.', response.status);
  if (result?.status !== 'success' || !('data' in result)) throw new BatteryRequestError('Kết quả hợp đồng thuê pin chưa hợp lệ. Tải lại trang để kiểm tra.');
  return result.data as T;
}
