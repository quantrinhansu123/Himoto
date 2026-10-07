import { NextRequest, NextResponse } from 'next/server';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { himotoPool } from '@/lib/server/himoto-database';

export const runtime = 'nodejs';
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await protectDatabaseRequest(request); if (denied) return denied;
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ status: 'error', message: 'Mã sao lưu không hợp lệ.' }, { status: 400 });
  try {
    const result = await himotoPool.query('SELECT id,created_at,created_by,action,row_count,sha256,payload FROM himoto.vehicle_import_backups WHERE id=$1::uuid', [id]);
    if (!result.rowCount) return NextResponse.json({ status: 'error', message: 'Không tìm thấy bản sao lưu.' }, { status: 404 });
    return NextResponse.json(result.rows[0], { headers: { 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="HIMOTO-xe-backup-${id}.json"` } });
  } catch {
    return NextResponse.json({ status: 'error', message: 'Không đọc được bản sao lưu.' }, { status: 500 });
  }
}
