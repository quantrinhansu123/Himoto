import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { STORE_SELECT_SQL, StoreSaveError, createDatabaseStore, parseStoreCreation } from '@/lib/server/store-management';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  try {
    const result = await himotoPool.query(`${STORE_SELECT_SQL} ORDER BY s.id`);
    return NextResponse.json({ status: 'success', data: result.rows }, { headers });
  } catch {
    return NextResponse.json({ status: 'error', message: 'Không tải được danh sách cơ sở.' }, { status: 500, headers });
  }
}

export async function POST(request: NextRequest) {
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
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') return NextResponse.json({ status: 'error', message: 'Thông tin cơ sở bị trùng. Nhấn Làm mới để kiểm tra trước khi tạo lại.' }, { status: 409, headers });
    console.error('Store creation failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: 'Chưa xác nhận được cơ sở mới. Nhấn Làm mới để kiểm tra trước khi tạo lại.' }, { status: 500, headers });
  } finally { client?.release(); }
}
