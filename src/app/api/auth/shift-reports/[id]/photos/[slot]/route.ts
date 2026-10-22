import { NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { SHIFT_PHOTOS } from '@/lib/management/shift-reports';
import { validatePhotoBytes } from '@/lib/server/record-photos';
import { dataAccess } from '@/lib/server/access-context';
import { hasPermission } from '@/lib/management/permissions';
import { ShiftRequestError, shiftRequestId, shiftRequestHash, readShiftReceipt, writeShiftReceipt } from '@/lib/server/shift-report-requests';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string; slot: string }> };
async function handle(request: NextRequest, context: Context) {
  const user = dataAccess.getStore();
  if (request.method === 'PUT' && !hasPermission(user,'contracts.draft') && !hasPermission(user,'finance.write')) return NextResponse.json({ message: 'Không có quyền thay ảnh báo cáo.' }, { status: 403 });
  const { id, slot } = await context.params;
  if (!/^[1-9]\d{0,14}$/.test(id) || !SHIFT_PHOTOS.some(([key]) => key === slot)) return NextResponse.json({ message: 'Ảnh không hợp lệ.' }, { status: 400 });
  let client;
  try {
    if (request.method === 'GET') {
      // One MVCC read: no row locks or multi-query transaction for image views.
      const photo = (await himotoPool.query(`SELECT p.mime_type,p.data FROM himoto.management_shift_photos p
        JOIN himoto.management_shift_reports r ON r.id=p.report_id AND r.store_id=p.store_id
        WHERE r.id=$1 AND p.slot=$2`, [id,slot])).rows[0];
      if (!photo) return NextResponse.json({ message: 'Chưa có ảnh.' }, { status: 404 });
      return new Response(new Uint8Array(photo.data), { headers: { 'Content-Type': photo.mime_type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    let bytes: Buffer | undefined;
    const mime = request.headers.get('content-type') || '';
    const requestId = request.method === 'PUT' ? shiftRequestId(request.headers) : null;
    const revision = Number(request.headers.get('x-report-revision'));
    if (request.method === 'PUT') {
      if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Phiên bản báo cáo không hợp lệ.');
      // Read a bounded stream even when Content-Length is absent.
      const reader = request.body?.getReader();
      if (!reader) throw new Error('Chọn ảnh để tải lên.');
      const parts: Uint8Array[] = []; let size = 0;
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 2097152) { await reader.cancel(); throw new Error('Mỗi ảnh tối đa 2 MB.'); } parts.push(part.value); }
      bytes = Buffer.concat(parts); validatePhotoBytes(mime, bytes);
    }
    client = await himotoPool.connect(); await client.query('BEGIN');
    const hash = request.method === 'PUT' ? shiftRequestHash(JSON.stringify({ actor: user!.id, id, slot, revision, mime }), bytes!) : '';
    const receipt = await readShiftReceipt(client, requestId, user!.id, hash);
    if (receipt) { await client.query('COMMIT'); return NextResponse.json({ data: receipt }); }
    const report = (await client.query('SELECT store_id,status FROM himoto.management_shift_reports WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!report) { await client.query('ROLLBACK'); return NextResponse.json({ message: 'Không tìm thấy báo cáo.' }, { status: 404 }); }
    if (report.status !== 'draft') { await client.query('ROLLBACK'); return NextResponse.json({ message: 'Báo cáo đã chốt, không thể thay ảnh.' }, { status: 409 }); }
    const updated = await client.query('UPDATE himoto.management_shift_reports SET revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$2 RETURNING revision', [id,revision]);
    if (!updated.rowCount) { await client.query('ROLLBACK'); return NextResponse.json({ message: 'Báo cáo đã thay đổi. Mở lại trước khi thay ảnh.' }, { status: 409 }); }
    await client.query(`INSERT INTO himoto.management_shift_photos(report_id,store_id,slot,mime_type,data) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(report_id,slot) DO UPDATE SET mime_type=EXCLUDED.mime_type,data=EXCLUDED.data`, [id,report.store_id,slot,mime,bytes]);
    const saved = { revision: updated.rows[0].revision };
    await writeShiftReceipt(client, requestId, user!.id, Number(report.store_id), hash, saved);
    await client.query('COMMIT'); return NextResponse.json({ data: saved });
  } catch (e) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (e instanceof ShiftRequestError) return NextResponse.json({ message: e.message }, { status: e.status });
    if ((e as { code?: string }).code) return failureResponse('Chưa xử lý được ảnh. Vui lòng thử lại.', e);
    return NextResponse.json({ message: e instanceof Error && e.message ? e.message : 'Ảnh không hợp lệ.' }, { status: 400 });
  } finally { client?.release(); }
}
export const GET = withAccessRequest(handle);
export const PUT = withAccessRequest(handle);
