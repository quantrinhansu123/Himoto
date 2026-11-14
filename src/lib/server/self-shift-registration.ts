import 'server-only';
import type { PoolClient } from 'pg';
import type { SessionUser } from './management-session';
import { attendanceStaff } from './attendance';
import { DutyError, validDutyDate } from './duty-roster';
import { saveRegistration, parseRegistration } from './shift-registration';
import { addDays, vietnamDate, weekStart } from '@/lib/management/duty-roster';
import { monthDates } from '@/lib/management/shift-registration';
import type { SelfRegistrationWeek } from '@/lib/management/self-shift-registration';

type Database = Pick<PoolClient, 'query'>;
export function selfRegistrationDates(week: string, today = vietnamDate()) {
  if (!validDutyDate(week) || weekStart(week) !== week || week < weekStart(today)) throw new DutyError('Chọn tuần hiện tại hoặc tuần sắp tới.');
  try { monthDates(week.slice(0, 7)); monthDates(addDays(week, 6).slice(0, 7)); } catch { throw new DutyError('Tuần đăng ký không hợp lệ.'); }
  return Array.from({ length: 7 }, (_, index) => addDays(week, index));
}
async function ownStaff(db: Database, user: SessionUser) {
  const staff = await attendanceStaff(db, user);
  if (!staff) throw new DutyError('Tài khoản chưa liên kết với một nhân viên đang hoạt động. Liên hệ quản lý nhân sự.', 409);
  if (!staff.store_id) throw new DutyError('Nhân viên chưa được gắn cơ sở. Liên hệ quản lý nhân sự.', 409);
  return { id: Number(staff.id), name: String(staff.full_name), store_id: Number(staff.store_id), store_name: String(staff.store_name || '') };
}
export async function readSelfRegistrationWeek(db: Database, user: SessionUser, week: string, today = vietnamDate()): Promise<SelfRegistrationWeek> {
  const dates = selfRegistrationDates(week, today);
  const staff = await ownStaff(db, user);
  const result = await db.query(`SELECT staff_id,store_id,work_date::text,shift_code,revision::text
    FROM himoto.staff_shift_registrations WHERE staff_id=$1 AND work_date BETWEEN $2::date AND $3::date ORDER BY work_date`, [staff.id, dates[0], dates[6]]);
  return { week, today, dates, staff, registrations: result.rows.map(row => ({ staff_id: Number(row.staff_id), store_id: Number(row.store_id), work_date: String(row.work_date), shift_code: row.shift_code == null ? null : String(row.shift_code), revision: String(row.revision) })) };
}
/** All selected days are committed together by the route's transaction. Never accept a target staff ID. */
export async function saveSelfRegistrationWeek(db: Database, user: SessionUser, raw: unknown, today = vietnamDate()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new DutyError('Đăng ký tuần không hợp lệ.');
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some(key => !['week','days'].includes(key)) || typeof body.week !== 'string' || !Array.isArray(body.days) || !body.days.length || body.days.length > 7) throw new DutyError('Chọn từ 1 đến 7 ngày cần đăng ký.');
  const dates = selfRegistrationDates(body.week, today);
  const staff = await ownStaff(db, user);
  const seen = new Set<string>();
  const inputs = body.days.map(rawDay => {
    if (!rawDay || typeof rawDay !== 'object' || Array.isArray(rawDay) || Object.keys(rawDay).some(key => !['work_date','shift_code','revision'].includes(key))) throw new DutyError('Thông tin ngày đăng ký không hợp lệ.');
    const day = rawDay as Record<string, unknown>;
    const input = parseRegistration({ ...day, staff_id: staff.id, store_id: staff.store_id });
    if (!dates.includes(input.work_date) || input.work_date < today || seen.has(input.work_date)) throw new DutyError('Không được sửa ngày đã qua, đăng ký trùng ngày hoặc ngoài tuần đã chọn.');
    seen.add(input.work_date);
    return input;
  });
  // Deterministic lock order when multiple clients edit the same week.
  for (const input of inputs.sort((a, b) => a.work_date.localeCompare(b.work_date))) await saveRegistration(db, user.id, input);
  return readSelfRegistrationWeek(db, user, body.week, today);
}
