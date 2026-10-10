import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest, SESSION_COOKIE, userFromSession } from '@/lib/server/management-session';
import { ContractReturnError, replaceContractVehicle } from '@/lib/server/contract-returns';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  const user = await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ status: 'error', message: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
  let client;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ContractReturnError('Thông tin đổi xe không hợp lệ.');
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some(key => !['item_id', 'item_revision', 'vehicle_id'].includes(key)) ||
        !Number.isSafeInteger(input.item_id) || Number(input.item_id) <= 0 || !Number.isSafeInteger(input.vehicle_id) || Number(input.vehicle_id) <= 0 ||
        typeof input.item_revision !== 'string' || !/^\d{1,20}$/.test(input.item_revision)) throw new ContractReturnError('Thông tin đổi xe không hợp lệ.');
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const data = await replaceContractVehicle(client, user.id, { item_id: Number(input.item_id), item_revision: input.item_revision, vehicle_id: Number(input.vehicle_id) });
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof ContractReturnError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Thông tin đổi xe không hợp lệ.' }, { status: 400 });
    console.error('Contract vehicle change failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: 'Không đổi được xe trên hợp đồng.' }, { status: 500 });
  } finally { client?.release(); }
}
