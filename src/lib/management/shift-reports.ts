export const SHIFT_PHOTOS = [
  ['vehicles', 'Ảnh kiểm kê xe'], ['batteries', 'Ảnh kiểm kê pin'],
  ['cash', 'Ảnh tiền mặt thực tế'], ['personal', 'Ảnh tài khoản cá nhân'],
  ['company', 'Ảnh tài khoản Công ty'], ['door', 'Ảnh khóa cửa'],
] as const;
export const SHIFT_SUMMARY_FIELDS = [
  ['contracts_total', 'Tổng số hợp đồng', false],
  ['contracts_completed', 'Hoàn thành', false],
  ['contracts_renting', 'Đang thuê', false],
  ['contracts_overdue', 'Quá hạn', false],
  ['income_total', 'Tổng thu thực tế', true],
  ['income_deposit', 'Tổng thu cọc', true],
  ['income_renewal', 'Tổng thu gia hạn', true],
  ['income_rental', 'Tổng thu phí thuê', true],
  ['expense_total', 'Tổng chi thực tế', true],
  ['deposit_refund', 'Tổng tiền cọc phải trả', true],
  ['early_refund', 'Tổng tiền hoàn lại do trả sớm', true],
  ['late_penalty', 'Tổng tiền phạt muộn', true],
] as const;
export type ShiftSummary = Record<typeof SHIFT_SUMMARY_FIELDS[number][0], number>;
export const emptyShiftSummary = (): ShiftSummary => Object.fromEntries(SHIFT_SUMMARY_FIELDS.map(([key]) => [key, 0])) as ShiftSummary;
export interface ShiftInput {
  store_id: number; date: string; staff: string; vehicles: number; batteries: number;
  charged: number; transfers: number; cash: number; personal: number; company: number;
  rented_batteries?: number;
  electricity_off: boolean; notes: string;
  electrical_devices?: string;
  summary?: ShiftSummary;
  daily_vehicles?: number;
  monthly_vehicles?: number;
}
export interface ShiftReport {
  id: number; store_name: string; payload: ShiftInput; status: 'draft' | 'submitted';
  revision: number; created_by_name: string; updated_at: string; photos: string[];
}
export function shiftVehicleTotal(input: Pick<ShiftInput, 'vehicles'|'daily_vehicles'|'monthly_vehicles'>): number | null {
  const counts = [input.vehicles, input.daily_vehicles, input.monthly_vehicles];
  return counts.every(value => Number.isSafeInteger(value) && Number(value) >= 0)
    ? counts.reduce<number>((sum, value) => sum + Number(value), 0) : null;
}
export function parseShiftInput(raw: unknown): ShiftInput {
  if (!raw || typeof raw !== 'object') throw new Error('Thông tin báo cáo không hợp lệ.');
  const b = raw as Record<string, unknown>;
  if (!Number.isSafeInteger(b.store_id) || Number(b.store_id) <= 0) throw new Error('Chọn PGD.');
  if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !Number.isFinite(Date.parse(b.date)) || new Date(b.date).toISOString().slice(0, 10) !== b.date) throw new Error('Ngày báo cáo không hợp lệ.');
  if (typeof b.staff !== 'string' || !b.staff.trim() || b.staff.length > 1000) throw new Error('Nhập nhân sự trực ca (tối đa 1.000 ký tự).');
  if (typeof b.notes !== 'string' || b.notes.length > 5000 || typeof b.electricity_off !== 'boolean') throw new Error('Kiểm tra ghi chú và xác nhận an toàn.');
  if (b.electrical_devices !== undefined && (typeof b.electrical_devices !== 'string' || b.electrical_devices.length > 1000)) throw new Error('Danh sách thiết bị điện tối đa 1.000 ký tự.');
  const numbers = ['vehicles', 'batteries', 'charged', 'transfers', 'cash', 'personal', 'company'] as const;
  for (const key of numbers) if (!Number.isSafeInteger(b[key]) || Number(b[key]) < 0 || Number(b[key]) > (['cash', 'personal', 'company'].includes(key) ? 1e12 : 100000)) throw new Error('Số lượng và số tiền phải là số nguyên không âm hợp lệ.');
  if (Number(b.charged) > Number(b.batteries)) throw new Error('Số pin đầy không được vượt tổng số pin.');
  if (b.rented_batteries !== undefined && (!Number.isSafeInteger(b.rented_batteries) || Number(b.rented_batteries) < 0 || Number(b.rented_batteries) > 100000)) throw new Error('Số pin đã cho thuê phải là số nguyên không âm hợp lệ.');
  const hasVehicleCounts = b.daily_vehicles !== undefined || b.monthly_vehicles !== undefined;
  if (hasVehicleCounts) {
    for (const key of ['daily_vehicles','monthly_vehicles']) {
      if (!Number.isSafeInteger(b[key]) || Number(b[key]) < 0 || Number(b[key]) > 100000) throw new Error('Số xe cho thuê ngày và tháng phải là số nguyên không âm hợp lệ.');
    }
  }
  let summary: ShiftSummary | undefined;
  if (b.summary !== undefined) {
    if (!b.summary || typeof b.summary !== 'object' || Array.isArray(b.summary)) throw new Error('Thống kê hợp đồng và thu chi không hợp lệ.');
    const values = b.summary as Record<string, unknown>;
    for (const [key, label, currency] of SHIFT_SUMMARY_FIELDS) {
      if (!Number.isSafeInteger(values[key]) || Number(values[key]) < 0 || Number(values[key]) > (currency ? 1e12 : 100000)) throw new Error(`${label} phải là số nguyên không âm hợp lệ.`);
    }
    summary = Object.fromEntries(SHIFT_SUMMARY_FIELDS.map(([key]) => [key, values[key]])) as ShiftSummary;
  }
  return { store_id: Number(b.store_id), date: b.date, staff: b.staff.trim(), notes: b.notes.trim(), electricity_off: b.electricity_off,
    ...(typeof b.electrical_devices === 'string' ? { electrical_devices: b.electrical_devices.trim() } : {}),
    ...(b.rented_batteries !== undefined ? { rented_batteries: b.rented_batteries } : {}),
    ...Object.fromEntries(numbers.map(k => [k, b[k]])), ...(summary ? { summary } : {}),
    ...(hasVehicleCounts ? { daily_vehicles: b.daily_vehicles, monthly_vehicles: b.monthly_vehicles } : {}) } as ShiftInput;
}
