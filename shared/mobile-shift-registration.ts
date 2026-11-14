import { ATTENDANCE_SHIFTS } from './attendance-shifts';

export const REGISTRATION_SHIFTS = [...ATTENDANCE_SHIFTS, { code: 'G1+G3', name: 'Ca sáng + tối', start: '08:00', end: '21:00', credit: 1 }] as const;
export interface RegisteredStaff { id: number; name: string; position: string; store_id: number | null; store_name: string; status: string }
export interface ShiftRegistration { staff_id: number; store_id: number; work_date: string; shift_code: string | null; revision: string }
export interface RegistrationMonth { month: string; staff: RegisteredStaff[]; registrations: ShiftRegistration[]; stores: { id: number; name: string }[] }
export interface RegistrationRange extends Omit<RegistrationMonth,'month'> {from:string;to:string}
export function registrationDates(from: string, to: string) {
  for (const date of [from,to]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(`${date}T00:00:00Z`))||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date) throw new Error('Chọn ngày bắt đầu và kết thúc hợp lệ.');
    monthDates(date.slice(0,7));
  }
  const count=(Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86_400_000+1;
  if(count<1||count>93)throw new Error('Ngày kết thúc phải từ ngày bắt đầu, tối đa 93 ngày mỗi lần xem.');
  return Array.from({length:count},(_,index)=>new Date(Date.parse(`${from}T00:00:00Z`)+index*86_400_000).toISOString().slice(0,10));
}
export function registrationMonthRange(month:string){const dates=monthDates(month);return{from:dates[0],to:dates[dates.length-1]};}
export function registrationExcel(data:RegistrationRange,store='all',search='') {
  const dates=registrationDates(data.from,data.to),cells=new Map(data.registrations.map(row=>[`${row.staff_id}:${row.work_date}`,row]));
  const people=data.staff.filter(person=>(store==='all'||(store==='none'?person.store_id===null:String(person.store_id)===store))&&`${person.name} ${person.position}`.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')));
  return{headers:['Địa điểm làm việc','Họ và tên','Chức vụ',...dates.map(date=>date.split('-').reverse().join('/')),'Tổng công đăng ký'],rows:people.map(person=>[person.store_name,person.name,person.position,...dates.map(date=>cells.get(`${person.id}:${date}`)?.shift_code||''),dates.reduce((sum,date)=>sum+registrationCredit(cells.get(`${person.id}:${date}`)?.shift_code),0)])};
}
export interface SelfRegistrationWeek { week: string; today: string; dates: string[]; staff: { id: number; name: string; store_id: number; store_name: string }; registrations: ShiftRegistration[] }
export type RegistrationInput = Omit<ShiftRegistration, 'revision'> & { revision: string | null };
export interface SelfRegistrationInput { week: string; days: Pick<RegistrationInput, 'work_date' | 'shift_code' | 'revision'>[] }
export function monthDates(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 2000 || Number(month.slice(0, 4)) > 2100) throw new Error('Tháng phải nằm trong khoảng 2000–2100.');
  const length = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  return Array.from({ length }, (_, day) => `${month}-${String(day + 1).padStart(2, '0')}`);
}
export function registrationCredit(code: string | null | undefined) { return REGISTRATION_SHIFTS.find(shift => shift.code === code)?.credit ?? 0; }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export function isShiftRegistration(value: unknown): value is ShiftRegistration {
  return object(value) && id(value.staff_id) && id(value.store_id) && date(value.work_date) && (value.shift_code === null || REGISTRATION_SHIFTS.some(s => s.code === value.shift_code)) && typeof value.revision === 'string' && /^[1-9]\d{0,17}$/.test(value.revision);
}
export function isRegistrationMonth(value: unknown): value is RegistrationMonth {
  if (!object(value) || typeof value.month !== 'string') return false;
  try { monthDates(value.month); } catch { return false; }
  return Array.isArray(value.staff) && value.staff.every(s => object(s) && id(s.id) && [s.name, s.position, s.store_name, s.status].every(v => typeof v === 'string') && (s.store_id === null || id(s.store_id))) && Array.isArray(value.registrations) && value.registrations.every(isShiftRegistration) && Array.isArray(value.stores) && value.stores.every(s => object(s) && id(s.id) && typeof s.name === 'string');
}
export function isSelfRegistrationWeek(value: unknown): value is SelfRegistrationWeek {
  return object(value) && date(value.week) && date(value.today) && Array.isArray(value.dates) && value.dates.length === 7 && value.dates.every(date) && object(value.staff) && id(value.staff.id) && id(value.staff.store_id) && typeof value.staff.name === 'string' && typeof value.staff.store_name === 'string' && Array.isArray(value.registrations) && value.registrations.every(isShiftRegistration);
}
export function isRegistrationRange(value:unknown):value is RegistrationRange {
  if(!object(value)||typeof value.from!=='string'||typeof value.to!=='string')return false;
  let dates:string[];try{dates=registrationDates(value.from,value.to);}catch{return false;}
  return isRegistrationMonth({...value,month:value.from.slice(0,7)})&&Array.isArray(value.registrations)&&value.registrations.every(row=>isShiftRegistration(row)&&dates.includes(row.work_date))&&new Set(value.registrations.map(row=>`${row.staff_id}:${row.work_date}`)).size===value.registrations.length;
}
