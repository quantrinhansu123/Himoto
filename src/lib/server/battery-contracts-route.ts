import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from './himoto-database';
import { protectDatabaseRequest, SESSION_COOKIE, userFromSession } from './management-session';
import { BatteryContractError, deleteBatteryContract, listBatteryContracts, parseBatteryInput, saveBatteryContract } from './battery-contracts';

export async function handleBatteryContractRequest(request: NextRequest, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', rawId?: string) {
  const denied = await protectDatabaseRequest(request); if (denied) return denied;
  let client;
  try {
    const id = rawId === undefined ? undefined : Number(rawId);
    if (rawId !== undefined && (!/^\d+$/.test(rawId) || !Number.isSafeInteger(id) || Number(id) <= 0)) throw new BatteryContractError('Mã hợp đồng thuê pin không hợp lệ.');
    const user = method === 'GET' ? null : await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);
    if (method !== 'GET' && !user) return NextResponse.json({ status: 'error', message: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
    const raw = method === 'GET' ? null : await request.json();
    const input = method === 'POST' || method === 'PATCH' ? parseBatteryInput(raw, method === 'PATCH') : null;
    if (method === 'DELETE' && (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => key !== 'revision') || typeof raw.revision !== 'string')) throw new BatteryContractError('Phiên bản hợp đồng không hợp lệ.');
    const store = request.nextUrl.searchParams.get('store_id');
    if (method === 'GET' && store !== null && !/^[1-9]\d*$/.test(store)) throw new BatteryContractError('Cơ sở không hợp lệ.');
    client = await himotoPool.connect(); await client.query(method === 'GET' ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
    const data = method === 'GET' ? await listBatteryContracts(client, store === null ? undefined : Number(store))
      : method === 'DELETE' ? await deleteBatteryContract(client, id!, raw.revision, user!.id) : await saveBatteryContract(client, user!.id, input!, id);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof BatteryContractError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Thông tin hợp đồng thuê pin không hợp lệ.' }, { status: 400 });
    if (error && typeof error === 'object' && 'code' in error && ['23503', '23505', '55P03', '40P01'].includes(String(error.code))) return NextResponse.json({ status: 'error', message: 'Dữ liệu đang thay đổi. Tải lại trang rồi thử lại.' }, { status: 409 });
    console.error('Battery contract request failed:', error instanceof Error ? error.name : 'Unknown error');
    return NextResponse.json({ status: 'error', message: 'Chưa xác nhận được hợp đồng thuê pin. Tải lại trang để kiểm tra trước khi thử lại.' }, { status: 500 });
  } finally { client?.release(); }
}
