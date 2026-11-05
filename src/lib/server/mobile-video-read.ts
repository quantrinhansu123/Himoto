import 'server-only';
import type { NextRequest } from 'next/server';
import type { SessionUser } from './management-session';
import { parseMobileMediaTarget, withMobileMedia, readMediaTarget } from './mobile-record-media';
import { requireContractPhotoSlot, RecordPhotoError } from './record-photos';
import { readCloudinaryPhoto } from './cloudinary-photos';
import { readObjectVideoResponse } from './cloudfly-videos';
import { isMediaRevision, isMobileMediaSlot } from '../../../shared/mobile-record-media';
import { MOBILE_MAX_VIDEO_BYTES } from '../../../shared/mobile-video';
import { MobileError } from './mobile-session';
import { MOBILE_HEADERS } from './mobile-response';

export function videoRange(value: string | null) {
  if (value !== null && (!/^bytes=(?:\d{1,9}-\d{0,9}|-\d{1,9})$/.test(value) || /^bytes=-0+$/.test(value))) throw new MobileError('Khoảng video chưa hợp lệ.', 416, 'INVALID_RANGE');
  if (value && /^bytes=\d+-\d+$/.test(value)) { const [a,b]=value.slice(6).split('-').map(Number); if (b<a) throw new MobileError('Khoảng video chưa hợp lệ.',416,'INVALID_RANGE'); }
  return value;
}
export async function readMobileVideo(user: SessionUser, raw: Parameters<typeof parseMobileMediaTarget>[0], slot: string, request: NextRequest) {
  const target = parseMobileMediaTarget(raw), p = request.nextUrl.searchParams, revision = p.get('revision'), range = videoRange(request.headers.get('range'));
  if (target.entity !== 'contracts' || !isMobileMediaSlot(target, slot) || !/-video-[1-3]$/.test(slot) || [...p.keys()].some(k => k !== 'revision' || p.getAll(k).length !== 1) || !isMediaRevision(revision) || request.headers.has('idempotency-key')) throw new MobileError('Cần đúng ô và phiên bản video để xem.', 400, 'INVALID_VIDEO');
  const row = await withMobileMedia(user, target, async client => {
    await readMediaTarget(client, target); await requireContractPhotoSlot(client, target.entity, target.id, slot);
    const r = (await client.query('SELECT xmin::text AS revision,mime_type,data,cloudinary_public_id,cloudinary_cloud_name,cloudinary_version,object_bucket,object_key,object_etag FROM himoto.management_record_photos WHERE entity_type=$1 AND entity_id=$2 AND slot=$3', [target.entity, target.id, slot])).rows[0];
    if (!r) throw new MobileError('Chưa có video trong ô này.', 404, 'NOT_FOUND');
    if (r.revision !== revision) throw new MobileError('Video đã thay đổi. Tải lại hồ sơ trước khi xem.', 409, 'MEDIA_REVIEW_REQUIRED');
    if (r.mime_type !== 'video/mp4') throw new MobileError('Video đã lưu chưa đúng định dạng MP4.', 415, 'UNSUPPORTED_MEDIA'); return r;
  });
  return streamMobileVideo(row,range,revision);
}

type VideoStorage=Parameters<typeof readCloudinaryPhoto>[0]&Parameters<typeof readObjectVideoResponse>[0]&{data?:Uint8Array|null};
export async function streamMobileVideo(row:VideoStorage,rawRange:string|null,revision:string) {
  const range=videoRange(rawRange);
  // Network I/O follows the completed scoped read. No external location or
  // redirect can receive the native request's Himoto Authorization header.
  let remote: Response;
  try {
    if (row.object_key) remote = await readObjectVideoResponse(row, range);
    else if (row.cloudinary_public_id) remote = await readCloudinaryPhoto(row, range);
    else {
      const bytes = Buffer.from(row.data || []); if (!bytes.length || bytes.length > MOBILE_MAX_VIDEO_BYTES) throw new MobileError('Video trống hoặc vượt 45 MB.', 413, 'MEDIA_TOO_LARGE');
      let start = 0, end = bytes.length - 1;
      if (range) { const [a, b] = range.slice(6).split('-'); start = a ? Number(a) : Math.max(0, bytes.length - Number(b)); end = a && b ? Math.min(Number(b), end) : end; if (start > end || start >= bytes.length) return new Response(null, { status: 416, headers: { ...MOBILE_HEADERS, 'Content-Range': `bytes */${bytes.length}` } }); }
      remote = new Response(new Uint8Array(bytes.subarray(start, end + 1)), { status: range ? 206 : 200, headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(end - start + 1), ...(range ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}) } });
    }
  } catch (error) { if (error instanceof RecordPhotoError) throw new MobileError(error.message, error.status, 'VIDEO_UNAVAILABLE'); throw error; }
  const length = Number(remote.headers.get('content-length')), contentRange = remote.headers.get('content-range'), parsed = contentRange?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  if (![200, 206].includes(remote.status) || !remote.body || !Number.isSafeInteger(length) || length <= 0 || length > MOBILE_MAX_VIDEO_BYTES || (remote.headers.get('content-type') || '').split(';')[0] !== 'video/mp4' || remote.status === 206 && (!parsed || Number(parsed[3]) > MOBILE_MAX_VIDEO_BYTES || Number(parsed[2]) < Number(parsed[1]) || Number(parsed[2]) - Number(parsed[1]) + 1 !== length || Number(parsed[2]) >= Number(parsed[3]))) {
    await remote.body?.cancel().catch(() => {}); throw new MobileError('Chưa tải đúng nội dung video. Thử lại.', 502, 'INVALID_VIDEO_RESPONSE');
  }
  let received = 0, released = false; const reader = remote.body.getReader();
  const release = () => { if (!released) { released = true; reader.releaseLock(); } };
  const cancel = async () => { if (!released) { await reader.cancel().catch(() => {}); release(); } };
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try { const next = await reader.read(); if (next.done) { release(); if (received !== length) controller.error(Error('Video stream incomplete')); else controller.close(); return; } received += next.value.byteLength; if (received > length || received > MOBILE_MAX_VIDEO_BYTES) { await cancel(); controller.error(Error('Video stream length mismatch')); return; } controller.enqueue(next.value); }
      catch { await cancel(); controller.error(Error('Video stream unavailable')); }
    }, cancel,
  });
  return new Response(body, { status: remote.status, headers: { ...MOBILE_HEADERS, 'Content-Type': 'video/mp4', 'Content-Length': String(length), 'Accept-Ranges': 'bytes', 'Content-Disposition': 'inline; filename="himoto-video.mp4"', ETag: `"${revision}"`, ...(contentRange ? { 'Content-Range': contentRange } : {}) } });
}
