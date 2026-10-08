import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest, userFromSession, SESSION_COOKIE } from '@/lib/server/management-session';
import { ContractPaymentError, parseContractPayment, readPaymentContext, recordContractPayment } from '@/lib/server/contract-payments';

export const runtime = 'nodejs';
type Params = { params: Promise<{ id: string }> };
async function handle(request: NextRequest, { params }: Params, writing: boolean) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  let client;
  try {
    const { id } = await params;
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new ContractPaymentError('Mã hợp đồng không hợp lệ.');
    const input = writing ? parseContractPayment(await request.json()) : null;
    const user = writing ? await userFromSession(request.cookies.get(SESSION_COOKIE)?.value) : null;
    if (writing && !user) return NextResponse.json({ status: 'error', message: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
    client = await himotoPool.connect();
    await client.query(writing ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const data = input && user ? await recordContractPayment(client, Number(id), user.id, input) : await readPaymentContext(client, Number(id));
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof ContractPaymentError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Thông tin thanh toán không hợp lệ.' }, { status: 400 });
    console.error('Contract payment request failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: writing ? 'Chưa xác nhận được thanh toán. Tải lại lịch sử để kiểm tra; khi thử lại, hệ thống giữ mã lần thu để tránh ghi trùng.' : 'Không tải được thông tin thanh toán.' }, { status: 500 });
  } finally { client?.release(); }
}
export const GET = (request: NextRequest, params: Params) => handle(request, params, false);
export const POST = (request: NextRequest, params: Params) => handle(request, params, true);
