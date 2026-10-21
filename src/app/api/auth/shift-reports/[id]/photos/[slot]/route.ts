import { NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { SHIFT_PHOTOS } from '@/lib/management/shift-reports';
import { validatePhotoBytes } from '@/lib/server/record-photos';
import { dataAccess } from '@/lib/server/access-context';
import { hasPermission } from '@/lib/management/permissions';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string; slot: string }> };
async function handle(request: NextRequest, context: Context) {
  const user = dataAccess.getStore();
  if (request.method === 'PUT' && !hasPermission(user,'contracts.draft') && !hasPermission(user,'finance.write')) return NextResponse.json({ message: 'Không có quyền thay ảnh báo cáo.' }, { status: 403 });
  const { id, slot } = await context.params;
  if (!/^[1-9]\d{0,14}$/.test(id) || !SHIFT_PHOTOS.some(([key]) => key === slot)) return NextResponse.json({ message: 'Ảnh không hợp lệ.' }, { status: 400 });
  let client;
  try {
    let bytes: Buffer | undefined;
    const mime = request.headers.get('content-type') || '';
    if (request.method === 'PUT') {
      // Read a bounded stream even when Content-Length is absent.
      const reader = request.body?.getReader();
      if (!reader) throw new Error('Chọn ảnh để tải lên.');
      const parts: Uint8Array[] = []; let size = 0;
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 2097152) { await reader.cancel(); throw new Error('Mỗi ảnh tối đa 2 MB.'); } parts.push(part.value); }
      bytes = Buffer.concat(parts); validatePhotoBytes(mime, bytes);
    }
    client = await himotoPool.connect(); await client.query('BEGIN');
    const report = (await client.query('SELECT store_id,status FROM himoto.management_shift_reports WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!report) { await client.query('ROLLBACK'); return NextResponse.json({ message: 'Không tìm thấy báo cáo.' }, { status: 404 }); }
    if (request.method === 'GET') {
      const photo = (await client.query('SELECT mime_type,data FROM himoto.management_shift_photos WHERE report_id=$1 AND slot=$2', [id,slot])).rows[0];
      await client.query('COMMIT');
      if (!photo) return NextResponse.json({ message: 'Chưa có ảnh.' }, { status: 404 });
      return new Response(new Uint8Array(photo.data), { headers: { 'Content-Type': photo.mime_type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (report.status !== 'draft') { await client.query('ROLLBACK'); return NextResponse.json({ message: 'Báo cáo đã chốt, không thể thay ảnh.' }, { status: 409 }); }
    const revision = Number(request.headers.get('x-report-revision'));
    const updated = await client.query('UPDATE himoto.management_shift_reports SET revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$2 RETURNING revision', [id,revision]);
    if (!updated.rowCount) { await client.query('ROLLBACK'); return NextResponse.json({ message: 'Báo cáo đã thay đổi. Mở lại trước khi thay ảnh.' }, { status: 409 }); }
    await client.query(`INSERT INTO himoto.management_shift_photos(report_id,store_id,slot,mime_type,data) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(report_id,slot) DO UPDATE SET mime_type=EXCLUDED.mime_type,data=EXCLUDED.data`, [id,report.store_id,slot,mime,bytes]);
    await client.query('COMMIT'); return NextResponse.json({ data: { revision: updated.rows[0].revision } });
  } catch (e) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return NextResponse.json({ message: (e as { code?: string }).code ? 'Chưa xử lý được ảnh. Vui lòng thử lại.' : e instanceof Error ? e.message : 'Ảnh không hợp lệ.' }, { status: (e as { code?: string }).code ? 500 : 400 });
  } finally { client?.release(); }
}
export const GET = withAccessRequest(handle);
export const PUT = withAccessRequest(handle);
