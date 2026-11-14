import { ATTENDANCE_SHIFTS } from './attendance-shifts';

export const REGISTRATION_SHIFTS = [
  ...ATTENDANCE_SHIFTS,
  { code: 'G1+G3', name: 'Ca sáng + tối', start: '08:00', end: '21:00', credit: 1 },
] as const;
export interface RegisteredStaff {
  id: number; name: string; position: string; store_id: number | null; store_name: string; status: string;
}
export interface ShiftRegistration {
  staff_id: number; store_id: number; work_date: string; shift_code: string | null; revision: string;
}
export interface RegistrationMonth {
  month: string; staff: RegisteredStaff[]; registrations: ShiftRegistration[];
  stores: { id: number; name: string }[];
}
export function monthDates(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 2000 || Number(month.slice(0, 4)) > 2100) throw new Error('Tháng phải nằm trong khoảng 2000–2100.');
  const length = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  return Array.from({ length }, (_, day) => `${month}-${String(day + 1).padStart(2, '0')}`);
}
export function registrationCredit(code: string | null | undefined) {
  return REGISTRATION_SHIFTS.find(shift => shift.code === code)?.credit ?? 0;
}
