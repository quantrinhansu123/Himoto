import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { changeCustomerBlacklist, CustomerBlacklistError, parseBlacklistChange } from '@/lib/server/customer-blacklist';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';

async function PATCHHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  let client;
  try {
    const { id: rawId } = await params;
    if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(Number(rawId)) || Number(rawId) <= 0) throw new CustomerBlacklistError('Mã khách hàng không hợp lệ.');
    const input = parseBlacklistChange(await request.json());
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const row = await changeCustomerBlacklist(client, Number(rawId), input);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data: row }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof CustomerBlacklistError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Thông tin đổi Blacklist không hợp lệ.' }, { status: 400 });
    return failureResponse('Chưa xác nhận được thay đổi Blacklist.', error);
  } finally { client?.release(); }
}

export const PATCH = withAccessRequest(PATCHHandler);
