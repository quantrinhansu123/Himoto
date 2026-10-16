import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest, SESSION_COOKIE, userFromSession } from '@/lib/server/management-session';
import { RecordPhotoError, parsePhotoTarget, requirePhotoRecord, writeRecordPhoto } from '@/lib/server/record-photos';
import { MAX_PHOTO_BYTES } from '@/lib/management/record-photos';

export const runtime = 'nodejs';
type Params = { params: Promise<{ entity: string; id: string; slot: string }> };
async function handle(request: NextRequest, { params }: Params, writing: boolean) {
  const denied = await protectDatabaseRequest(request); if (denied) return denied;
  let client;
  try {
    const raw = await params, target = parsePhotoTarget(raw.entity, raw.id, raw.slot);
    let data: Buffer | undefined;
    if (writing) {
      if (Number(request.headers.get('content-length')) > MAX_PHOTO_BYTES) throw new RecordPhotoError('Mỗi ảnh tối đa 2 MB.', 413);
      const reader = request.body?.getReader();
      if (!reader) throw new RecordPhotoError('Thiếu ảnh.');
      const chunks: Uint8Array[] = []; let size = 0;
      try { while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_PHOTO_BYTES) { await reader.cancel(); throw new RecordPhotoError('Mỗi ảnh tối đa 2 MB.', 413); }
        chunks.push(chunk.value);
      } } finally { reader.releaseLock(); }
      data = Buffer.concat(chunks);
    }
    const user = writing ? await userFromSession(request.cookies.get(SESSION_COOKIE)?.value) : null;
    if (writing && !user) return NextResponse.json({ status: 'error', message: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
    client = await himotoPool.connect();
    await client.query('BEGIN');
    let response: NextResponse;
    if (data && user) {
      await writeRecordPhoto(client, target.entity, target.id, raw.slot, request.headers.get('content-type') || '', data, user.id);
      response = NextResponse.json({ status: 'success' });
    } else {
      await requirePhotoRecord(client, target.entity, target.id);
      const result = await client.query('SELECT mime_type,data FROM himoto.management_record_photos WHERE entity_type=$1 AND entity_id=$2 AND slot=$3', [target.entity, target.id, raw.slot]);
      if (!result.rowCount) throw new RecordPhotoError('Chưa có ảnh.', 404);
      response = new NextResponse(new Uint8Array(result.rows[0].data), { headers: { 'Content-Type': result.rows[0].mime_type, 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline; filename="anh-ho-so"' } });
    }
    await client.query('COMMIT');
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return NextResponse.json({ status: 'error', message: error instanceof RecordPhotoError ? error.message : writing ? 'Không lưu được ảnh. Giữ form và thử lưu lại.' : 'Không tải được ảnh.' }, { status: error instanceof RecordPhotoError ? error.status : 500 });
  } finally { client?.release(); }
}
export const GET = (request: NextRequest, params: Params) => handle(request, params, false);
export const PUT = (request: NextRequest, params: Params) => handle(request, params, true);
