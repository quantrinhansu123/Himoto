import { REGISTRATION_SHIFTS } from './shift-registration';

export const SHIFT_SEARCH_OPTIONS = [
  { code: '', name: 'Chưa đăng ký', hours: 'Bỏ lựa chọn ca cho ngày này', credit: null },
  ...REGISTRATION_SHIFTS.map(shift => ({
    code: shift.code,
    name: shift.name,
    hours: shift.code === 'G1+G3' ? '08:00–12:00 · 17:00–21:00' : shift.start ? `${shift.start}–${shift.end}` : 'Ngày nghỉ',
    credit: shift.credit,
  })),
];
const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();
export function searchRegistrationShifts(query: string) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  return SHIFT_SEARCH_OPTIONS.filter(shift => {
    const hours = shift.hours.replace(/(\d{2}):00/g, (_, hour: string) => `${Number(hour)}h ${hour}h`);
    const searchable = normalize(`${shift.code} ${shift.name} ${shift.hours} ${hours}`);
    return tokens.every(token => searchable.includes(token));
  });
}
