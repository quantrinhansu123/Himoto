import 'server-only';
import type { PoolClient } from 'pg';
import type { SessionUser } from './management-session';
import { hasPermission, isAdminAccount } from '@/lib/management/permissions';

type Database = Pick<PoolClient, 'query'>;
export class AttendanceError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const canReviewAttendance = (user: SessionUser) => hasPermission(user, 'hr.read');
export function attendanceScope(user: SessionUser) {
  // These queries use the owner connection, so every read includes this explicit scope.
  return { reviewer: canReviewAttendance(user), all: isAdminAccount(user) || user.scope_all === true, store: user.store_id ?? null };
}
export function parseAttendanceLocation(value: string) {
  let raw;
  try { raw = JSON.parse(value); } catch { throw new AttendanceError('Không đọc được vị trí GPS.'); }
  if (!raw || typeof raw !== 'object' || typeof raw.latitude !== 'number' || typeof raw.longitude !== 'number' || typeof raw.accuracy !== 'number'
    || !Number.isFinite(raw.latitude) || Math.abs(raw.latitude) > 90 || !Number.isFinite(raw.longitude) || Math.abs(raw.longitude) > 180 || !Number.isFinite(raw.accuracy) || raw.accuracy < 0
    || typeof raw.timestamp !== 'number' || !Number.isFinite(raw.timestamp) || Math.abs(Date.now() - raw.timestamp) > 5 * 60000) throw new AttendanceError('GPS không hợp lệ hoặc đã quá 5 phút. Vui lòng lấy lại vị trí.');
  return { latitude: raw.latitude, longitude: raw.longitude, accuracy: raw.accuracy, timestamp: raw.timestamp };
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

export function attendanceLateMinutes(clockIn: string | Date, shiftStart: string | Date | null) {
  if (!shiftStart) return null;
  const difference = new Date(clockIn).getTime() - new Date(shiftStart).getTime();
  return Number.isFinite(difference) ? Math.max(0, Math.ceil(difference / 60000)) : null;
}
// Match the same staff and branch, including shifts crossing midnight.
export const ATTENDANCE_SHIFT_JOIN = `LEFT JOIN LATERAL (
  SELECT d.id,d.shift_name,d.starts_at,d.ends_at FROM himoto.store_duty_schedules d
  WHERE d.staff_id=a.staff_id AND d.store_id=a.store_id AND d.deleted_at IS NULL AND d.starts_at IS NOT NULL AND d.ends_at IS NOT NULL
    AND ((d.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=(a.clock_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
      OR d.starts_at<=a.clock_in_at AND d.ends_at>a.clock_in_at)
  ORDER BY CASE WHEN d.starts_at<=a.clock_in_at AND d.ends_at>a.clock_in_at THEN 0 ELSE 1 END,
    abs(extract(epoch FROM d.starts_at-a.clock_in_at)),d.id LIMIT 1
) duty ON true`;
