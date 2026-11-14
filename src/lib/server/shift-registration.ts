import 'server-only';
import type { PoolClient } from 'pg';
import { monthDates, REGISTRATION_SHIFTS, type RegistrationMonth, type ShiftRegistration } from '@/lib/management/shift-registration';
import { DutyError, validDutyDate } from './duty-roster';

type Database = Pick<PoolClient, 'query'>;
export function parseRegistration(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new DutyError('Đăng ký ca không hợp lệ.');
  const v = raw as Record<string, unknown>;
  if (Object.keys(v).some(key => !['staff_id','store_id','work_date','shift_code','revision'].includes(key)) ||
    !Number.isSafeInteger(v.staff_id) || Number(v.staff_id) <= 0 || !Number.isSafeInteger(v.store_id) || Number(v.store_id) <= 0 ||
    typeof v.work_date !== 'string' || !validDutyDate(v.work_date) ||
    (v.shift_code !== null && !REGISTRATION_SHIFTS.some(shift => shift.code === v.shift_code)) ||
    (v.revision !== null && (typeof v.revision !== 'string' || !/^[1-9]\d{0,17}$/.test(v.revision)))) throw new DutyError('Nhân viên, cơ sở, ngày hoặc mã ca không hợp lệ.');
  try { monthDates(v.work_date.slice(0, 7)); } catch { throw new DutyError('Ngày đăng ký không hợp lệ.'); }
  return { staff_id: Number(v.staff_id), store_id: Number(v.store_id), work_date: v.work_date, shift_code: v.shift_code as string | null, revision: v.revision as string | null };
}
const columns = 'staff_id,store_id,work_date::text,shift_code,revision::text';
function map(row: Record<string, unknown>): ShiftRegistration {
  return { staff_id: Number(row.staff_id), store_id: Number(row.store_id), work_date: String(row.work_date), shift_code: row.shift_code == null ? null : String(row.shift_code), revision: String(row.revision) };
}
export async function readRegistrationMonth(db: Database, month: string): Promise<RegistrationMonth> {
  let dates: string[];
  try { dates = monthDates(month); } catch { throw new DutyError('Tháng không hợp lệ (2000–2100).'); }
  const args = [dates[0], dates[dates.length - 1]];
  const staff = await db.query(`SELECT p.id,p.full_name,p.position,p.store_id,s.store_name,p.status
    FROM himoto.staff_profiles p LEFT JOIN himoto.stores s ON s.id=p.store_id
    WHERE p.status='active' OR EXISTS (SELECT 1 FROM himoto.staff_shift_registrations r WHERE r.staff_id=p.id AND r.work_date BETWEEN $1::date AND $2::date)
    ORDER BY s.store_name NULLS LAST,p.full_name,p.id`, args);
  const registrations = await db.query(`SELECT ${columns} FROM himoto.staff_shift_registrations WHERE work_date BETWEEN $1::date AND $2::date`, args);
  const stores = await db.query('SELECT id,store_name FROM himoto.stores ORDER BY store_name,id');
  return { month, staff: staff.rows.map(p => ({ id: Number(p.id), name: String(p.full_name), position: String(p.position || ''), store_id: p.store_id == null ? null : Number(p.store_id), store_name: String(p.store_name || 'Chưa có cơ sở'), status: String(p.status) })), registrations: registrations.rows.map(map), stores: stores.rows.map(s => ({ id: Number(s.id), name: String(s.store_name) })) };
}
export async function saveRegistration(db: Database, actorId: number, raw: unknown) {
  const input = parseRegistration(raw);
  if (!Number.isSafeInteger(actorId) || actorId <= 0) throw new DutyError('Người thực hiện không hợp lệ.');
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query("SET LOCAL statement_timeout='15s'");
  const staff = await db.query("SELECT id FROM himoto.staff_profiles WHERE id=$1 AND store_id=$2 AND status='active' FOR SHARE", [input.staff_id, input.store_id]);
  if (!staff.rowCount) throw new DutyError('Nhân viên đã đổi cơ sở hoặc ngừng hoạt động. Làm mới bảng.', 409);
  const store = await db.query("SELECT id FROM himoto.stores WHERE id=$1 AND status IN ('opening','active') FOR SHARE", [input.store_id]);
  if (!store.rowCount) throw new DutyError('Cơ sở không còn hoạt động.', 409);
  const previous = await db.query('SELECT shift_code,revision::text FROM himoto.staff_shift_registrations WHERE staff_id=$1 AND work_date=$2::date FOR UPDATE', [input.staff_id, input.work_date]);
  if ((previous.rows[0]?.revision ?? null) !== input.revision) throw new DutyError('Ô đăng ký đã được người khác thay đổi. Làm mới để xem ca mới nhất.', 409);
  const args = [input.staff_id, input.work_date, input.store_id, input.shift_code, actorId];
  const saved = input.revision === null
    ? await db.query(`INSERT INTO himoto.staff_shift_registrations(staff_id,work_date,store_id,shift_code,created_by,updated_by) VALUES($1,$2::date,$3,$4,$5,$5) ON CONFLICT DO NOTHING RETURNING ${columns}`, args)
    : await db.query(`UPDATE himoto.staff_shift_registrations SET store_id=$3,shift_code=$4,updated_by=$5,updated_at=now(),revision=revision+1 WHERE staff_id=$1 AND work_date=$2::date AND revision=$6::bigint RETURNING ${columns}`, [...args, input.revision]);
  if (!saved.rowCount) throw new DutyError('Ô đăng ký vừa thay đổi. Làm mới bảng trước khi đăng ký lại.', 409);
  const row = map(saved.rows[0]);
  await db.query(`INSERT INTO himoto.staff_shift_registration_history(staff_id,work_date,store_id,previous_code,shift_code,revision,actor_id) VALUES($1,$2::date,$3,$4,$5,$6::bigint,$7)`, [row.staff_id, row.work_date, row.store_id, previous.rows[0]?.shift_code ?? null, row.shift_code, row.revision, actorId]);
  return row;
}
