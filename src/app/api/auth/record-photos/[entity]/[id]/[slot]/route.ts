import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest, SESSION_COOKIE, userFromSession } from '@/lib/server/management-session';
import { RecordPhotoError, parsePhotoTarget, requirePhotoRecord,requireContractPhotoSlot, writeRecordPhoto, deleteRecordPhoto } from '@/lib/server/record-photos';
import { MAX_PHOTO_BYTES } from '@/lib/management/record-photos';
import { verifyPhotoReceipt, writeCloudinaryPhoto, readCloudinaryPhoto, cleanupConvertedVideo, type CloudPhotoReceipt } from '@/lib/server/cloudinary-photos';
import { objectVideoUrl } from '@/lib/server/cloudfly-videos';
import { isBrowserVideoReceipt, verifyBrowserVideoReceipt, readyBrowserVideo } from '@/lib/server/browser-videos';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';
export const maxDuration = 300;
type Params = { params: Promise<{ entity: string; id: string; slot: string }> };
async function handle(request: NextRequest, { params }: Params, writing: boolean) {
  const denied = await protectDatabaseRequest(request); if (denied) return denied;
  let client;
  try {
    const raw = await params, target = parsePhotoTarget(raw.entity, raw.id, raw.slot);
    let data: Buffer | undefined;
    let receiptBody: unknown;
    if (writing && request.headers.get('content-type') === 'application/json') {
      if (Number(request.headers.get('content-length')) > 2048) throw new RecordPhotoError('Thông tin ảnh không hợp lệ.');
      const text = await request.text(); if (text.length > 2048) throw new RecordPhotoError('Thông tin ảnh không hợp lệ.');
      receiptBody = JSON.parse(text);
    } else if (writing) {
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
    const direct = writing && !data && user && isBrowserVideoReceipt(receiptBody) ? verifyBrowserVideoReceipt(receiptBody, user.id) : undefined;
    const receipt: CloudPhotoReceipt | undefined = writing && !data && user && !direct ? verifyPhotoReceipt(receiptBody, user.id) : undefined;
    client = await himotoPool.connect();
    await client.query('BEGIN');
    if(writing)await requireContractPhotoSlot(client,target.entity,target.id,raw.slot);
    let response: NextResponse;
    if (user && (data || receipt || direct)) {
      if (direct) {
        if (target.entity !== 'contracts' || !/-video-[1-3]$/.test(raw.slot)) throw new RecordPhotoError('Video chỉ lưu ở ô video hợp đồng.');
        await requirePhotoRecord(client, target.entity, target.id);
        const stored = await readyBrowserVideo(direct, user.id, 60);
        await client.query(`INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by,object_bucket,object_key,object_etag)
          VALUES($1,$2,$3,'video/mp4',NULL,$4,$5,$6,$7) ON CONFLICT(entity_type,entity_id,slot)
          DO UPDATE SET mime_type='video/mp4',data=NULL,updated_by=EXCLUDED.updated_by,updated_at=now(),
            cloudinary_public_id=NULL,cloudinary_cloud_name=NULL,cloudinary_version=NULL,
            object_bucket=EXCLUDED.object_bucket,object_key=EXCLUDED.object_key,object_etag=EXCLUDED.object_etag`,
        [target.entity,target.id,raw.slot,user.id,stored.object_bucket,stored.object_key,stored.object_etag]);
      }
      else if (receipt) { await requirePhotoRecord(client, target.entity, target.id); await writeCloudinaryPhoto(client, target.entity, target.id, raw.slot, user.id, receipt); }
      else await writeRecordPhoto(client, target.entity, target.id, raw.slot, request.headers.get('content-type') || '', data!, user.id);
      response = NextResponse.json({ status: 'success' });
    } else {
      await requirePhotoRecord(client, target.entity, target.id, false);
      const result = await client.query('SELECT mime_type,data,cloudinary_public_id,cloudinary_cloud_name,cloudinary_version,object_bucket,object_key,object_etag FROM himoto.management_record_photos WHERE entity_type=$1 AND entity_id=$2 AND slot=$3', [target.entity, target.id, raw.slot]);
      if (!result.rowCount) throw new RecordPhotoError('Chưa có ảnh.', 404);
      await client.query('COMMIT'); client.release(); client = undefined;
      const photo = result.rows[0];
      if (photo.object_key) response = NextResponse.redirect(await objectVideoUrl(photo), 307);
      else if (photo.cloudinary_public_id) {
        const remote = await readCloudinaryPhoto(photo,request.headers.get('range'));
        const headers:Record<string,string>={'Content-Type':photo.mime_type,'X-Content-Type-Options':'nosniff','Content-Disposition':`inline; filename="${photo.mime_type==='video/mp4'?'video-hop-dong.mp4':'anh-ho-so.jpg'}"`};
        for(const key of ['Content-Length','Content-Range','Accept-Ranges']){const value=remote.headers.get(key);if(value)headers[key]=value;}
        response = new NextResponse(remote.body, {status:remote.status,headers});
      } else response = new NextResponse(new Uint8Array(photo.data), { headers: { 'Content-Type': photo.mime_type, 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline; filename="anh-ho-so"' } });
    }
    if (client) { await client.query('COMMIT'); client.release(); client = undefined; }
    if (receipt) await cleanupConvertedVideo(receipt);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof RecordPhotoError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    return failureResponse(writing ? 'Không lưu được ảnh. Giữ form và thử lưu lại.' : 'Không tải được ảnh.', error);
  } finally { client?.release(); }
}
const GETHandler = (request: NextRequest, params: Params) => handle(request, params, false);
const PUTHandler = (request: NextRequest, params: Params) => handle(request, params, true);
async function DELETEHandler(request: NextRequest, { params }: Params) {
  const denied = await protectDatabaseRequest(request); if (denied) return denied;
  let client;
  try {
    const raw = await params, target = parsePhotoTarget(raw.entity, raw.id, raw.slot);
    if (!target.slot) throw new RecordPhotoError('Loại ảnh không hợp lệ.');
    const user = await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!user) return NextResponse.json({ status: 'error', message: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
    client = await himotoPool.connect();
    await client.query('BEGIN');
    await requireContractPhotoSlot(client, target.entity, target.id, raw.slot);
    await deleteRecordPhoto(client, target.entity, target.id, raw.slot);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success' }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof RecordPhotoError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    return failureResponse('Không xóa được ảnh.', error);
  } finally { client?.release(); }
}

export const GET = withAccessRequest(GETHandler);
export const PUT = withAccessRequest(PUTHandler);
export const DELETE = withAccessRequest(DELETEHandler);
