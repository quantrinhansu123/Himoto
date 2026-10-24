import { NextResponse } from 'next/server';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { dataAccess } from './access-context';
import { AccountAccessError } from './account-management';
import { syncStaffAccount,requireStaffAccountScope } from './staff-accounts';
import { normalizeStaffPosition } from '@/lib/management/staff-positions';
import { failureResponse } from './public-failure';

const json = (status: number, message: string) => NextResponse.json({ status: 'error', message }, { status });
const STATUSES = ['active', 'inactive', 'leave'];

/** Parses `hr/staff/{id}`; returns null when the path is not a staff item. */
export function parseStaffPath(path: string[]): number | null {
  if (path.length !== 3 || path[0] !== 'hr' || path[1] !== 'staff' || !/^\d+$/.test(path[2])) return null;
  const id = Number(path[2]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function readStaffBody(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
    body = parsed as Record<string, unknown>;
  } catch { return json(400, 'Thông tin nhân sự không hợp lệ.'); }
  const str = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  const name = str(body.name), phone = str(body.phone), email = str(body.email), position = normalizeStaffPosition(str(body.position)), status = str(body.status);
  const storeId = body.store_id == null || body.store_id === '' ? null : Number(body.store_id);
  if (!name || name.length > 191 || position.length > 191 || !/^\+?\d{9,13}$/.test(phone.replace(/[\s.()-]/g, '')) ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || !STATUSES.includes(status) || (storeId !== null && (!Number.isInteger(storeId) || storeId <= 0))) {
    return json(400, 'Kiểm tra họ tên, số điện thoại, email, cơ sở và trạng thái.');
  }
  return { body, name, phone, email, position, status, storeId };
}

export async function createStaff(request: Request) {
  const input = await readStaffBody(request);
  if (input instanceof NextResponse) return input;
  const { name, phone, email, position, status, storeId } = input;
  const joinedAt = typeof input.body.joined_at === 'string' ? input.body.joined_at.trim() : '';
  if (joinedAt && !/^\d{4}-\d{2}-\d{2}$/.test(joinedAt)) return json(400, 'Ngày vào làm không hợp lệ.');
  const user=dataAccess.getStore();if(!user)return json(401,'Phiên đăng nhập đã hết hạn.');
  let client;
  try {
    requireStaffAccountScope(user,storeId);
    client=await ownerDatabase.connect();await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['management-accounts']);
    if (storeId !== null && !(await client.query('SELECT 1 FROM himoto.stores WHERE id=$1', [storeId])).rowCount)throw new AccountAccessError('Cơ sở đã chọn không còn tồn tại.');
    const result = await client.query(
      `WITH next AS (SELECT nextval('himoto.staff_profiles_id_seq') AS id)
       INSERT INTO himoto.staff_profiles (id, staff_code, full_name, phone, email, position, store_id, status, joined_at, created_at, updated_at)
       SELECT next.id, 'NV' || lpad(next.id::text, GREATEST(4,length(next.id::text)), '0'), $1, $2, NULLIF($3,''), NULLIF($4,''), $5, $6, NULLIF($7,'')::date, now(), now() FROM next
       RETURNING id, staff_code`,
      [name, phone, email, position, storeId, status, joinedAt]);
    const credentials=await syncStaffAccount(client,user.id,Number(result.rows[0].id),user);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data: {...result.rows[0],credentials} }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if(client)await client.query('ROLLBACK').catch(()=>{});
    if(error instanceof AccountAccessError)return json(error.status,error.message);
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') return failureResponse('Mã nhân sự vừa sinh đã tồn tại.', error);
    return failureResponse('Không tạo được nhân sự.', error);
  }finally{client?.release();}
}

export async function updateStaff(id: number, request: Request) {
  const input = await readStaffBody(request);
  if (input instanceof NextResponse) return input;
  const { name, phone, email, position, status, storeId } = input;
  const user=dataAccess.getStore();if(!user)return json(401,'Phiên đăng nhập đã hết hạn.');
  let client;
  try {
    requireStaffAccountScope(user,storeId);
    client=await ownerDatabase.connect();await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['management-accounts']);
    const before=(await client.query('SELECT store_id,status FROM himoto.staff_profiles WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!before)throw new AccountAccessError('Không tìm thấy nhân sự cần cập nhật.',404);
    requireStaffAccountScope(user,before.store_id);
    if(storeId!==null&&!(await client.query('SELECT 1 FROM himoto.stores WHERE id=$1',[storeId])).rowCount)throw new AccountAccessError('Cơ sở đã chọn không còn tồn tại.');
    const result = await client.query(
      `UPDATE himoto.staff_profiles SET full_name=$2, phone=$3, email=NULLIF($4,''), position=NULLIF($5,''), store_id=$6, status=$7, updated_at=now() WHERE id=$1 RETURNING id`,
      [id, name, phone, email, position, storeId, status]);
    if (!result.rowCount)throw new AccountAccessError('Không tìm thấy nhân sự cần cập nhật.',404);
    const credentials=await syncStaffAccount(client,user.id,id,user,undefined,before.status!=='active'&&status==='active');await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data: {credentials} }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if(client)await client.query('ROLLBACK').catch(()=>{});
    if(error instanceof AccountAccessError)return json(error.status,error.message);
    return failureResponse('Không lưu được thay đổi nhân sự.', error);
  }finally{client?.release();}
}
