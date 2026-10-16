import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest, SESSION_COOKIE, userFromSession } from '@/lib/server/management-session';
import { ContractReturnError, loadContractReturnableItems, parseReturnBatch, recordVehicleReturn, searchReturnableItems } from '@/lib/server/contract-returns';

export const runtime = 'nodejs';

async function GETHandler(request: NextRequest) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  try {
    const query = request.nextUrl.searchParams.get('query') || '';
    const rawOrderId = request.nextUrl.searchParams.get('order_id');
    const data = rawOrderId ? await loadContractReturnableItems(himotoPool, Number(rawOrderId)) : await searchReturnableItems(himotoPool, query);
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Contract return lookup failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: 'Không tải được danh sách xe cần trả.' }, { status: 500 });
  }
}

async function POSTHandler(request: NextRequest) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  const user = await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ status: 'error', message: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
  let client;
  try {
    const body = await request.json();
    const inputs = parseReturnBatch(body);
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const results = [];
    for (const input of inputs) results.push(await recordVehicleReturn(client, user.id, input));
    await client.query('COMMIT');
    const data = body && typeof body === 'object' && 'items' in body ? results : results[0];
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof ContractReturnError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Thông tin trả xe không hợp lệ.' }, { status: 400 });
    console.error('Contract return failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: 'Chưa ghi nhận được lần trả xe. Tải lại danh sách để kiểm tra.' }, { status: 500 });
  } finally { client?.release(); }
}

export const GET = withAccessRequest(GETHandler);
export const POST = withAccessRequest(POSTHandler);
