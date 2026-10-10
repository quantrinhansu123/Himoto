import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest, SESSION_COOKIE, userFromSession } from '@/lib/server/management-session';
import { ContractRenewalError, parseRenewalInput, recordContractRenewal } from '@/lib/server/contract-renewals';

export const runtime = 'nodejs';
type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  const user = await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ status: 'error', message: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
  let client;
  try {
    const { id } = await params;
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new ContractRenewalError('Mã hợp đồng không hợp lệ.');
    const input = parseRenewalInput(await request.json());
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const data = await recordContractRenewal(client, Number(id), user.id, input);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof ContractRenewalError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Thông tin gia hạn không hợp lệ.' }, { status: 400 });
    console.error('Contract renewal failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: 'Không lưu được gia hạn hợp đồng.' }, { status: 500 });
  } finally { client?.release(); }
}
