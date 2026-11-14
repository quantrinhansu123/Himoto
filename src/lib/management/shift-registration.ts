import { monthDates, type RegistrationMonth } from '../../../shared/mobile-shift-registration';
export { REGISTRATION_SHIFTS, monthDates, registrationCredit, type RegisteredStaff, type ShiftRegistration, type RegistrationMonth } from '../../../shared/mobile-shift-registration';
export interface RegistrationRange extends Omit<RegistrationMonth, 'month'> { from: string; to: string }
export function registrationDates(from: string, to: string) {
  for (const date of [from, to]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Chọn ngày bắt đầu và kết thúc hợp lệ.');
    monthDates(date.slice(0, 7));
  }
  const count = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (count < 1 || count > 93) throw new Error('Ngày kết thúc phải từ ngày bắt đầu, tối đa 93 ngày mỗi lần xem.');
  return Array.from({ length: count }, (_, index) => new Date(Date.parse(`${from}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10));
}
export function registrationMonthRange(month: string) {
  const dates = monthDates(month);
  return { from: dates[0], to: dates[dates.length - 1] };
}
