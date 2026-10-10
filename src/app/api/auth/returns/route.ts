import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest, SESSION_COOKIE, userFromSession } from '@/lib/server/management-session';
import { ContractReturnError, loadContractReturnableItems, parseReturnInput, recordVehicleReturn, searchReturnableItems } from '@/lib/server/contract-returns';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
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

export async function POST(request: NextRequest) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  const user = await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ status: 'error', message: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
  let client;
  try {
    const input = parseReturnInput(await request.json());
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const data = await recordVehicleReturn(client, user.id, input);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof ContractReturnError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Thông tin trả xe không hợp lệ.' }, { status: 400 });
    console.error('Contract return failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: 'Chưa ghi nhận được lần trả xe. Tải lại danh sách để kiểm tra.' }, { status: 500 });
  } finally { client?.release(); }
}
