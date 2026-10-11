import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { BulkDeleteError, bulkDelete, parseBulkDelete } from '@/lib/server/bulk-delete';

export const runtime = 'nodejs';
type Params = { params: Promise<{ kind: string }> };

export async function DELETE(request: NextRequest, { params }: Params) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  let client;
  try {
    const { kind, ids } = parseBulkDelete((await params).kind, await request.json());
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const deleted = await bulkDelete(client, kind, ids);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data: { ids: deleted } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof BulkDeleteError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Danh sách cần xóa không hợp lệ.' }, { status: 400 });
    console.error('Bulk delete failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: 'Không xóa được. Chưa có thay đổi nào được ghi.' }, { status: 500 });
  } finally { client?.release(); }
}
