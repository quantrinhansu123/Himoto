import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { DutyInput, DutySchedule } from '@/lib/management/duty-roster';
import { addDays, weekStart } from '@/lib/management/duty-roster';
type Database = Pick<PoolClient, 'query'>;
export class DutyError extends Error { constructor(message: string, public status = 400) { super(message); } }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validDutyDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value; }
const validTime = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}+07:00`)) && new Date(Date.parse(`${value}+07:00`) + 7 * 3600000).toISOString().slice(0,16) === value;
export function parseDutyInput(body: unknown, editing = false): DutyInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new DutyError('Thông tin ca trực không hợp lệ.');
  const value = body as Record<string, unknown>;
  const fields = ['store_id','staff_id','starts_at','ends_at','shift_name','role_in_shift','notes',editing ? 'revision' : 'request_id'];
  if (Object.keys(value).some(key=>!fields.includes(key)) || !Number.isSafeInteger(value.store_id) || Number(value.store_id)<=0 || !Number.isSafeInteger(value.staff_id) || Number(value.staff_id)<=0 ||
    !validTime(value.starts_at) || !validTime(value.ends_at) || typeof value.shift_name !== 'string' || !value.shift_name.trim() || value.shift_name.trim().length > 80 ||
    typeof value.role_in_shift !== 'string' || !value.role_in_shift.trim() || value.role_in_shift.trim().length > 100 || typeof value.notes !== 'string' || value.notes.trim().length > 2000 ||
    (editing ? typeof value.revision !== 'string' || !/^\d{1,20}$/.test(value.revision) : typeof value.request_id !== 'string' || !uuid.test(value.request_id))) throw new DutyError('Chọn cơ sở, nhân viên, ngày giờ và tên ca hợp lệ.');
  const start=Date.parse(`${value.starts_at}+07:00`),end=Date.parse(`${value.ends_at}+07:00`);
  if (end<=start || end-start>24*3600000) throw new DutyError('Giờ kết thúc phải sau giờ bắt đầu; một ca tối đa 24 giờ.');
  return { store_id:Number(value.store_id),staff_id:Number(value.staff_id),starts_at:String(value.starts_at),ends_at:String(value.ends_at),shift_name:value.shift_name.trim(),role_in_shift:value.role_in_shift.trim(),notes:value.notes.trim(),
    ...(editing ? {revision:String(value.revision)} : {request_id:String(value.request_id).toLowerCase()}) };
}
const SELECT = `SELECT d.id,d.store_id,s.store_name,d.staff_id,d.staff_name,d.staff_phone,d.duty_date::text,d.shift_name,d.role_in_shift,d.notes,d.starts_at,d.ends_at,d.xmin::text AS revision
  FROM himoto.store_duty_schedules d LEFT JOIN himoto.stores s ON s.id=d.store_id`;
function map(row: Record<string, unknown>): DutySchedule {
  const time=(value:unknown)=>value instanceof Date ? value.toISOString() : value == null ? null : String(value);
  return {id:Number(row.id),store_id:Number(row.store_id),store_name:String(row.store_name||''),staff_id:row.staff_id==null?null:Number(row.staff_id),staff_name:String(row.staff_name||''),staff_phone:String(row.staff_phone||''),duty_date:String(row.duty_date),shift_name:String(row.shift_name||''),role_in_shift:String(row.role_in_shift||''),notes:String(row.notes||''),starts_at:time(row.starts_at),ends_at:time(row.ends_at),revision:String(row.revision)};
}
export async function listDuties(client: Database, date: string, storeId?: number) {
  if (!validDutyDate(date) || (storeId!==undefined && (!Number.isSafeInteger(storeId)||storeId<=0))) throw new DutyError('Tuần hoặc cơ sở không hợp lệ.');
  const start=weekStart(date),end=addDays(start,7);
  const result=await client.query(`${SELECT} WHERE d.deleted_at IS NULL AND ($3::bigint IS NULL OR d.store_id=$3)
    AND ((d.starts_at<$2::timestamptz AND d.ends_at>$1::timestamptz) OR (d.starts_at IS NULL AND d.duty_date>=$4::date AND d.duty_date<$5::date)) ORDER BY d.duty_date,d.starts_at,d.id`,[`${start}T00:00:00+07:00`,`${end}T00:00:00+07:00`,storeId??null,start,end]);
  return {week:start,schedules:result.rows.map(map)};
}
async function lock(client: Database) { await client.query("SET LOCAL lock_timeout='5s'"); await client.query("SET LOCAL statement_timeout='15s'"); await client.query('LOCK TABLE himoto.store_duty_schedules IN SHARE ROW EXCLUSIVE MODE'); }
async function readOne(client: Database,id:number) { const r=await client.query(`${SELECT} WHERE d.id=$1 AND d.deleted_at IS NULL`,[id]);if(!r.rowCount)throw new DutyError('Ca trực không còn tồn tại.',404);return map(r.rows[0]); }
export async function saveDuty(client: Database, actorId:number, raw:DutyInput,id?:number) {
  if (!Number.isSafeInteger(actorId)||actorId<=0 || (id!==undefined&&(!Number.isSafeInteger(id)||id<=0))) throw new DutyError('Mã ca trực hoặc người thực hiện không hợp lệ.');
  const input=parseDutyInput(raw,id!==undefined);
  await lock(client);
  const hash=createHash('sha256').update(JSON.stringify({actorId,...input})).digest('hex');
  if (id===undefined) {
    const previous=await client.query('SELECT id,request_hash,deleted_at FROM himoto.store_duty_schedules WHERE request_id=$1',[input.request_id]);
    if(previous.rowCount) { if(previous.rows[0].request_hash!==hash || previous.rows[0].deleted_at)throw new DutyError('Mã lần lưu đã được dùng. Làm mới lịch trực trước khi tạo ca khác.',409); return readOne(client,Number(previous.rows[0].id)); }
  } else { const current=await readOne(client,id);if(current.revision!==input.revision)throw new DutyError('Ca trực đã thay đổi. Làm mới và mở lại để sửa.',409); }
  const store=await client.query("SELECT id FROM himoto.stores WHERE id=$1 AND status IN ('opening','active') FOR SHARE",[input.store_id]);
  if(!store.rowCount)throw new DutyError('Cơ sở không tồn tại hoặc đã ngừng hoạt động.',409);
  const staff=await client.query("SELECT full_name,phone FROM himoto.staff_profiles WHERE id=$1 AND status='active' FOR SHARE",[input.staff_id]);
  if(!staff.rowCount)throw new DutyError('Chọn nhân viên đang hoạt động trong danh sách nhân sự.',409);
  const start=`${input.starts_at}:00+07:00`,end=`${input.ends_at}:00+07:00`;
  const conflict=await client.query(`SELECT id FROM himoto.store_duty_schedules WHERE staff_id=$1 AND deleted_at IS NULL AND ($2::bigint IS NULL OR id<>$2)
    AND ((starts_at<$4::timestamptz AND ends_at>$3::timestamptz) OR (starts_at IS NULL AND duty_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'<$4::timestamptz
      AND (duty_date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'>$3::timestamptz)) LIMIT 1`,[input.staff_id,id??null,start,end]);
  if(conflict.rowCount)throw new DutyError('Nhân viên đã có ca trực trùng giờ, kể cả tại cơ sở khác. Chọn lại giờ hoặc nhân viên.',409);
  const fields=[input.store_id,input.staff_id,start,end,input.shift_name,input.role_in_shift,input.notes,staff.rows[0].full_name,staff.rows[0].phone,actorId];
  if(id!==undefined) await client.query(`UPDATE himoto.store_duty_schedules SET store_id=$1,staff_id=$2,starts_at=$3::timestamptz,ends_at=$4::timestamptz,
    duty_date=($3::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,shift_name=$5,role_in_shift=$6,notes=$7,staff_name=$8,staff_phone=$9,updated_by=$10,updated_at=now() WHERE id=$11`,[...fields,id]);
  else id=Number((await client.query(`INSERT INTO himoto.store_duty_schedules(store_id,staff_id,starts_at,ends_at,duty_date,shift_name,role_in_shift,notes,staff_name,staff_phone,created_by,updated_by,created_at,updated_at,request_id,request_hash)
    VALUES($1,$2,$3::timestamptz,$4::timestamptz,($3::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,$5,$6,$7,$8,$9,$10,$10,now(),now(),$11,$12) RETURNING id`,[...fields,input.request_id,hash])).rows[0].id);
  return readOne(client,id);
}
export async function deleteDuty(client:Database,id:number,revision:string,actorId:number) {
  if(!Number.isSafeInteger(id)||id<=0 || !Number.isSafeInteger(actorId)||actorId<=0 || !/^\d{1,20}$/.test(revision))throw new DutyError('Mã ca trực hoặc phiên bản không hợp lệ.');
  await lock(client);const current=await readOne(client,id);
  if(current.revision!==revision)throw new DutyError('Ca trực đã thay đổi. Làm mới và kiểm tra trước khi xóa.',409);
  await client.query('UPDATE himoto.store_duty_schedules SET deleted_at=now(),updated_at=now(),updated_by=$2 WHERE id=$1',[id,actorId]);
  return null;
}
