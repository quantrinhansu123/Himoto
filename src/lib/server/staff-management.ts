import { NextResponse } from 'next/server';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { dataAccess } from './access-context';
import { AccountAccessError } from './account-management';
import { requireStaffAccountScope } from './staff-accounts';
import { parseStaffProfile, saveDatabaseStaff } from './staff-profile-write';
import { failureResponse } from './public-failure';

const json = (status: number, message: string) => NextResponse.json({ status: 'error', message }, { status });
/** Parses `hr/staff/{id}`; returns null when the path is not a staff item. */
export function parseStaffPath(path: string[]): number | null {
  if (path.length !== 3 || path[0] !== 'hr' || path[1] !== 'staff' || !/^\d+$/.test(path[2])) return null;
  const id = Number(path[2]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
async function mutate(request: Request, id?: number) {
  let input;
  try { input = parseStaffProfile(await request.json(), id === undefined); }
  catch (error) { return json(400, error instanceof AccountAccessError ? error.message : 'Thông tin nhân sự không hợp lệ.'); }
  const user = dataAccess.getStore();
  if (!user) return json(401, 'Phiên đăng nhập đã hết hạn.');
  let client;
  try {
    requireStaffAccountScope(user, input.store_id);
    client = await ownerDatabase.connect(); await client.query('BEGIN');
    const saved = await saveDatabaseStaff(client, user, input, id);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data: id === undefined ? saved : { credentials: saved.credentials } }, { status: id === undefined ? 201 : 200, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof AccountAccessError) return json(error.status, error.message);
    if (id === undefined && error && typeof error === 'object' && 'code' in error && error.code === '23505') return failureResponse('Mã nhân sự vừa sinh đã tồn tại.', error);
    return failureResponse(id === undefined ? 'Không tạo được nhân sự.' : 'Không lưu được thay đổi nhân sự.', error);
  } finally { client?.release(); }
}
export async function createStaff(request: Request) { return mutate(request); }
export async function updateStaff(id: number, request: Request) { return mutate(request, id); }
