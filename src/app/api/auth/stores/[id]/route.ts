import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { StoreSaveError, deleteDatabaseStore, parseStoreEdits, saveDatabaseStore } from '@/lib/server/store-management';

export const runtime = 'nodejs';
type Params = { params: Promise<{ id: string }> };

async function mutate(request: NextRequest, params: Params['params'], remove: boolean) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  let client;
  try {
    const rawId = (await params).id;
    const id = Number(rawId);
    if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(id) || id <= 0) throw new StoreSaveError('Mã cơ sở không hợp lệ.');
    const edits = remove ? null : parseStoreEdits(await request.json());
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const data = remove ? await deleteDatabaseStore(client, id) : await saveDatabaseStore(client, id, edits!);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data: data ?? null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof StoreSaveError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Thông tin cơ sở không hợp lệ.' }, { status: 400 });
    if (error && typeof error === 'object' && 'code' in error && (error.code === '23503' || error.code === '23505')) return NextResponse.json({ status: 'error', message: 'Cơ sở có dữ liệu liên quan hoặc thông tin trùng. Nhấn Làm mới để kiểm tra.' }, { status: 409 });
    console.error('Store mutation failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: 'Không cập nhật được cơ sở. Nhấn Làm mới để kiểm tra dữ liệu trước khi thử lại.' }, { status: 500 });
  } finally { client?.release(); }
}
export async function PATCH(request: NextRequest, { params }: Params) { return mutate(request, params, false); }
export async function DELETE(request: NextRequest, { params }: Params) { return mutate(request, params, true); }
