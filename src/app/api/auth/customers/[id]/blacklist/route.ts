import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { changeCustomerBlacklist, CustomerBlacklistError, parseBlacklistChange } from '@/lib/server/customer-blacklist';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

async function customerId({ params }: RouteContext) {
  const { id: rawId } = await params;
  if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(Number(rawId)) || Number(rawId) <= 0) throw new CustomerBlacklistError('Mã khách hàng không hợp lệ.');
  return Number(rawId);
}

async function GETHandler(request: NextRequest, context: RouteContext) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const id = await customerId(context);
    const result = await himotoPool.query(`SELECT id, xmin::text AS customer_revision,
      COALESCE(status = 2, false) AS blacklisted FROM himoto.customers WHERE id=$1`, [id]);
    if (!result.rowCount) throw new CustomerBlacklistError('Không tìm thấy khách hàng.', 404);
    return NextResponse.json({ status: 'success', data: result.rows[0] }, { headers });
  } catch (error) {
    if (error instanceof CustomerBlacklistError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status, headers });
    return failureResponse('Không tải được phiên bản hồ sơ khách hàng.', error);
  }
}

async function PATCHHandler(request: NextRequest, context: RouteContext) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  let client;
  try {
    const id = await customerId(context);
    const input = parseBlacklistChange(await request.json());
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const row = await changeCustomerBlacklist(client, id, input);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data: row }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof CustomerBlacklistError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Thông tin đổi Blacklist không hợp lệ.' }, { status: 400 });
    return failureResponse('Chưa xác nhận được thay đổi Blacklist.', error);
  } finally { client?.release(); }
}

export const GET = withAccessRequest(GETHandler);
export const PATCH = withAccessRequest(PATCHHandler);
