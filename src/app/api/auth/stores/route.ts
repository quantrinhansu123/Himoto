import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { STORE_SELECT_SQL, StoreSaveError, createDatabaseStore, parseStoreCreation } from '@/lib/server/store-management';
import { ManagementTableError, readManagementTable } from '@/lib/server/management-table';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };

async function GETHandler(request: NextRequest) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  try {
    if (request.nextUrl.searchParams.get('table') === '1' && request.nextUrl.searchParams.get('all') === '1') {
      const result = await himotoPool.query(`${STORE_SELECT_SQL} ORDER BY s.id`);
      return NextResponse.json({ status: 'success', data: result.rows }, { headers });
    }
    if (request.nextUrl.searchParams.get('table') === '1') {
      const client = await himotoPool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await client.query(request.nextUrl.searchParams.get('all') === '1'
          ? "SET LOCAL statement_timeout='60s'" : "SET LOCAL statement_timeout='20s'");
        const data = await readManagementTable(client, 'stores', request.nextUrl.searchParams);
        await client.query('COMMIT');
        return NextResponse.json({ status: 'success', data }, { headers });
      } catch (error) {
        await client.query('ROLLBACK');
        if (error instanceof ManagementTableError) return NextResponse.json({ status: 'error', message: error.message }, { status: 400, headers });
        if (error && typeof error === 'object' && 'code' in error && error.code === '57014') return NextResponse.json(
          { status: 'error', message: 'Dữ liệu đang phản hồi chậm. Vui lòng bấm Thử lại để tải danh sách.' },
          { status: 503, headers: { ...headers, 'Retry-After': '5' } });
        throw error;
      } finally { client.release(); }
    }
    const result = await himotoPool.query(`${STORE_SELECT_SQL} ORDER BY s.id`);
    return NextResponse.json({ status: 'success', data: result.rows }, { headers });
  } catch (error) {
    return failureResponse('Không tải được danh sách cơ sở.', error);
  }
}

async function POSTHandler(request: NextRequest) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  let client;
  try {
    const store = parseStoreCreation(await request.json());
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const data = await createDatabaseStore(client, store);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data }, { status: 201, headers });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof StoreSaveError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status, headers });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Thông tin cơ sở không hợp lệ.' }, { status: 400, headers });
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') return failureResponse('Thông tin cơ sở bị trùng.', error);
    return failureResponse('Chưa xác nhận được cơ sở mới.', error);
  } finally { client?.release(); }
}

export const GET = withAccessRequest(GETHandler);
export const POST = withAccessRequest(POSTHandler);
