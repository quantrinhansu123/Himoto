import 'server-only';
import type { PoolClient } from 'pg';
import type { SessionUser } from './management-session';
import { hasPermission, isAdminAccount } from '@/lib/management/permissions';
import { attendanceShift } from '@/lib/management/attendance-shifts';
import { REGISTRATION_SHIFTS } from '@/lib/management/shift-registration';

type Database = Pick<PoolClient, 'query'>;
export class AttendanceError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const canReviewAttendance = (user: SessionUser) => hasPermission(user, 'hr.read');
export function attendanceScope(user: SessionUser) {
  // These queries use the owner connection, so every read includes this explicit scope.
  return { reviewer: canReviewAttendance(user), all: isAdminAccount(user) || user.scope_all === true, store: user.store_id ?? null };
}
function attendanceEditTime(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new AttendanceError('Giờ chấm công không hợp lệ.');
  }
  const time = new Date(value);
  if (!Number.isFinite(time.getTime()) || time.toISOString() !== value) throw new AttendanceError('Giờ chấm công không hợp lệ.');
  return time;
}

export async function manageAttendance(db: Database, user: SessionUser, method: 'PATCH' | 'DELETE', input: unknown) {
  if (!isAdminAccount(user)) throw new AttendanceError('Chỉ quản trị viên được sửa hoặc xóa chấm công.',403);
  if (!input || typeof input !== 'object' || !('id' in input) || !/^[1-9]\d{0,14}$/.test(String(input.id))) {
    throw new AttendanceError('Lượt chấm công không hợp lệ.');
  }
  const body = input as Record<string, unknown>;
  const current = (await db.query(`SELECT clock_in_at,clock_out_at
    FROM himoto.management_staff_attendance WHERE id=$1 FOR UPDATE`,[body.id])).rows[0];
  if (!current) throw new AttendanceError('Không tìm thấy lượt chấm công.',404);
  if (current.clock_in_at.toISOString() !== body.original_in || (current.clock_out_at?.toISOString() ?? null) !== body.original_out) {
    throw new AttendanceError('Lượt chấm công đã thay đổi. Đóng cửa sổ và tải lại trước khi thử lại.',409);
  }
  if (method === 'DELETE') {
    await db.query('DELETE FROM himoto.management_staff_attendance WHERE id=$1',[body.id]);
    return;
  }
  const clockIn = attendanceEditTime(body.clock_in_at);
  const clockOut = body.clock_out_at === null && current.clock_out_at === null ? null : attendanceEditTime(body.clock_out_at);
  if (clockOut && clockOut < clockIn) throw new AttendanceError('Giờ ra phải từ giờ vào trở đi.');
  if ((clockOut ?? clockIn).getTime() > Date.now()) throw new AttendanceError('Giờ chấm công không được ở tương lai.');
  await db.query(`UPDATE himoto.management_staff_attendance
    SET clock_in_at=CASE WHEN $2::boolean THEN clock_in_at ELSE $3 END,
        clock_out_at=CASE WHEN $4::boolean THEN clock_out_at ELSE $5 END
    WHERE id=$1`,[body.id,body.clock_in_at === body.original_in,clockIn,body.clock_out_at === body.original_out,clockOut]);
}
export function parseAttendanceLocation(value: string) {
  let raw;
  try { raw = JSON.parse(value); } catch { throw new AttendanceError('Không đọc được vị trí GPS.'); }
  if (!raw || typeof raw !== 'object' || typeof raw.latitude !== 'number' || typeof raw.longitude !== 'number' || typeof raw.accuracy !== 'number'
    || !Number.isFinite(raw.latitude) || Math.abs(raw.latitude) > 90 || !Number.isFinite(raw.longitude) || Math.abs(raw.longitude) > 180 || !Number.isFinite(raw.accuracy) || raw.accuracy < 0
    || typeof raw.timestamp !== 'number' || !Number.isFinite(raw.timestamp) || Math.abs(Date.now() - raw.timestamp) > 5 * 60000) throw new AttendanceError('GPS không hợp lệ hoặc đã quá 5 phút. Vui lòng lấy lại vị trí.');
  return { latitude: raw.latitude, longitude: raw.longitude, accuracy: raw.accuracy, timestamp: raw.timestamp };
}

type Coordinates = { latitude: number; longitude: number };

export function attendanceDistanceMeters(punch: Coordinates | null, store: Coordinates | null) {
  if (!punch || !store) return null;
  const valid = ({latitude,longitude}: Coordinates) =>
    Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
    Number.isFinite(longitude) && Math.abs(longitude) <= 180;
  if (!valid(punch) || !valid(store)) return null;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(punch.latitude - store.latitude);
  const longitudeDelta = radians(punch.longitude - store.longitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(punch.latitude)) * Math.cos(radians(store.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(Math.min(1,haversine))));
}

export function attendancePhotoMime(bytes: Buffer) {
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new AttendanceError('Ảnh chấm công tối đa 2 MB.');
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  throw new AttendanceError('Chọn ảnh JPEG, PNG hoặc WebP.');
}
export async function attendanceStaff(db: Database, user: SessionUser) {
  const result = await db.query("SELECT p.id,p.full_name,p.store_id,s.store_name FROM himoto.staff_profiles p LEFT JOIN himoto.stores s ON s.id=p.store_id WHERE p.user_id=$1 AND p.status='active'", [user.id]);
  if (result.rows.length !== 1) return null;
  return result.rows[0];
}
export async function recordAttendance(db: Database, user: SessionUser, action: string, requestId: string, photo: Buffer, location: ReturnType<typeof parseAttendanceLocation>) {
  if (!['in','out'].includes(action) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new AttendanceError('Lần chấm công không hợp lệ.');
  const mime = attendancePhotoMime(photo);
  const staff = await attendanceStaff(db,user);
  if (!staff) throw new AttendanceError('Tài khoản chưa liên kết với một nhân viên đang hoạt động. Liên hệ quản lý nhân sự.',409);
  if (!staff.store_id) throw new AttendanceError('Nhân viên chưa được gắn cơ sở. Liên hệ quản lý nhân sự trước khi chấm công.',409);
  await db.query('SELECT pg_advisory_xact_lock(73412,hashtext($1))',[String(staff.id)]);
  const previous = await db.query('SELECT id,staff_id,actor_id,in_request,out_request FROM himoto.management_staff_attendance WHERE in_request=$1 OR out_request=$1',[requestId]);
  if (previous.rows.length) {
    if (Number(previous.rows[0].staff_id) !== Number(staff.id) || Number(previous.rows[0].actor_id) !== user.id) throw new AttendanceError('Mã lần chấm công đã được dùng.',409);
    if (String(previous.rows[0][action === 'in' ? 'in_request' : 'out_request']).toLowerCase() !== requestId.toLowerCase()) throw new AttendanceError('Mã lần chấm công thuộc thao tác khác.',409);
    return { id: Number(previous.rows[0].id), replayed: true };
  }
  const opened = await db.query('SELECT id FROM himoto.management_staff_attendance WHERE staff_id=$1 AND clock_out_at IS NULL FOR UPDATE',[staff.id]);
  if (action === 'in') {
    if (opened.rows.length) throw new AttendanceError('Bạn đã vào ca. Bấm Ra ca trước khi bắt đầu ca mới.',409);
    const result = await db.query(`INSERT INTO himoto.management_staff_attendance(staff_id,actor_id,store_id,staff_name,in_request,in_photo,in_mime,in_location)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING id`,[staff.id,user.id,staff.store_id,staff.full_name,requestId,photo,mime,JSON.stringify(location)]);
    return { id: Number(result.rows[0].id) };
  }
  if (!opened.rows.length) throw new AttendanceError('Bạn chưa vào ca hoặc ca đã được kết thúc.',409);
  await db.query(`UPDATE himoto.management_staff_attendance SET clock_out_at=clock_timestamp(),out_request=$2,out_photo=$3,out_mime=$4,out_location=$5::jsonb WHERE id=$1`,[opened.rows[0].id,requestId,photo,mime,JSON.stringify(location)]);
  return { id: Number(opened.rows[0].id) };
}

type AttendanceTime = string | Date | null | undefined;
const morningShift = attendanceShift('G1')!;
const eveningShift = attendanceShift('G3')!;
export const SPLIT_SHIFT_MORNING_END = morningShift.end;

function minutesAfter(later: AttendanceTime, earlier: AttendanceTime) {
  if (!later || !earlier) return null;
  const difference = new Date(later).getTime() - new Date(earlier).getTime();
  return Number.isFinite(difference) ? Math.max(0, Math.ceil(difference / 60000)) : null;
}
export function compareRegisteredAttendance(
  registration: { work_date: string | null; shift_code: string | null } | undefined,
  clockIn: AttendanceTime,
  clockOut: AttendanceTime,
) {
  const shift = REGISTRATION_SHIFTS.find(option => option.code === registration?.shift_code);
  const workDate = registration?.work_date;
  const atWorkTime = (time: string | null | undefined) =>
    workDate && time ? new Date(`${workDate}T${time}:00+07:00`).toISOString() : null;
  let segment = shift;
  const morningEnd = atWorkTime(SPLIT_SHIFT_MORNING_END);
  if (shift?.code === 'G1+G3' && clockIn && morningEnd) {
    segment = new Date(clockIn) < new Date(morningEnd) ? morningShift : eveningShift;
  }
  const scheduled_in = atWorkTime(segment?.start);
  const scheduled_out = atWorkTime(segment?.end);
  const lateMinutes = minutesAfter(clockIn, scheduled_in);
  const earlyMinutes = minutesAfter(scheduled_out, clockOut);
  const standardCredit = segment?.credit ?? null;
  // A full unit represents 480 paid minutes, including for shifts with an unpaid break.
  const earnedCredit = standardCredit === 0 ? 0
    : standardCredit === null || lateMinutes === null || earlyMinutes === null ? null
    : Math.max(0, standardCredit - (lateMinutes + earlyMinutes) / 480);
  return {
    shift_name: shift?.code ?? null,
    scheduled_in,
    scheduled_out,
    late_minutes: lateMinutes,
    early_leave_minutes: earlyMinutes,
    standard_credit: standardCredit,
    earned_credit: earnedCredit,
  };
}

// Weekly registration has one entry per employee and work date.
export const ATTENDANCE_SHIFT_JOIN = `LEFT JOIN himoto.staff_shift_registrations registration
  ON registration.staff_id=a.staff_id
  AND registration.work_date=(a.clock_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;
