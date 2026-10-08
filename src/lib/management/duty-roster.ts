export interface DutySchedule {
  id: number; store_id: number; store_name: string; staff_id: number | null; staff_name: string; staff_phone: string;
  duty_date: string; shift_name: string; role_in_shift: string; notes: string; starts_at: string | null; ends_at: string | null; revision: string;
}
export interface DutyInput {
  store_id: number; staff_id: number; starts_at: string; ends_at: string; shift_name: string; role_in_shift: string; notes: string;
  revision?: string; request_id?: string;
}
export function vietnamDate(now = new Date()) { return new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10); }
export function addDays(date: string, days: number) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0,10); }
export function weekStart(date: string) { const day = new Date(`${date}T00:00:00Z`).getUTCDay(); return addDays(date, -(day + 6) % 7); }
export function localDutyTime(date: string | null) { return date ? new Date(new Date(date).getTime() + 7 * 3600000).toISOString().slice(0,16) : ''; }
export class DutyRequestError extends Error { constructor(message: string, public status = 0) { super(message); } }
export async function dutyRequest<T>(url: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method, signal, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new DutyRequestError(result?.message || 'Không tải hoặc lưu được lịch trực. Làm mới để kiểm tra.', response.status);
  if (result?.status !== 'success' || !('data' in result)) throw new DutyRequestError('Kết quả lịch trực chưa hợp lệ. Làm mới để kiểm tra.');
  return result.data as T;
}
