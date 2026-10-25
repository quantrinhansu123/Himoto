import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { CopyObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, type HeadObjectCommandOutput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Input, BufferSource, MP4 } from 'mediabunny';
import { MAX_VIDEO_BYTES, type BrowserVideoReceipt } from '@/lib/management/video-media';
import { RecordPhotoError } from './record-photos';
import { cloudflyVideosEnabled, cloudflyVideoClient, cloudflyVideoSettings, readVideoBytes, type ObjectVideoRef } from './cloudfly-videos';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
interface UploadTicket { actor: number; id: string; bytes: number; sha256: string; max_duration: number; expires: number }

export const browserVideosEnabled = () => cloudflyVideosEnabled() && process.env.BROWSER_VIDEO_PROCESSING !== 'off';
function signature(value: string) {
  const secret = process.env.MANAGEMENT_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new RecordPhotoError('Chưa cấu hình xác minh video.', 503);
  return createHmac('sha256', secret).update(`himoto-browser-video-v1:${value}`).digest('hex');
}
function matches(actual: unknown, expected: string) {
  return typeof actual === 'string' && /^[a-f0-9]{64}$/.test(actual) && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
function objectKey(actor: number, id: string) { return `himoto/videos/browser/${actor}/${id}/v1.mp4`; }
function receipt(actor: number, id: string): BrowserVideoReceipt {
  return { provider: 'cloudfly-browser', resource_type: 'video', upload_id: id,
    signature: signature(`receipt:${cloudflyVideoSettings().bucket}:${actor}:${id}`) };
}
export function isBrowserVideoReceipt(value: unknown): value is BrowserVideoReceipt {
  return Boolean(value && typeof value === 'object' && (value as Record<string, unknown>).provider === 'cloudfly-browser');
}
export function verifyBrowserVideoReceipt(value: unknown, actor: number): BrowserVideoReceipt {
  if (!isBrowserVideoReceipt(value) || Array.isArray(value) || Object.keys(value).some(key => !['provider','resource_type','upload_id','signature'].includes(key)) ||
    value.resource_type !== 'video' || !UUID.test(value.upload_id) || !matches(value.signature, receipt(actor, value.upload_id).signature)) {
    throw new RecordPhotoError('Thông tin video không hợp lệ.');
  }
  return value;
}
async function head(key: string) {
  try { return await cloudflyVideoClient().send(new HeadObjectCommand({ Bucket: cloudflyVideoSettings().bucket, Key: key }), { abortSignal: AbortSignal.timeout(15_000) }); }
  catch (error) { if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null; throw error; }
}
function validation(actor: number, id: string, bytes: number, sha256: string, duration: string, audio: string) {
  return signature(`validated:${cloudflyVideoSettings().bucket}:${actor}:${id}:${bytes}:${sha256}:${duration}:h264:${audio}`);
}
function checked(head: HeadObjectCommandOutput | null, actor: number, id: string, maxDuration: number) {
  if (!head?.ETag || head.ContentType !== 'video/mp4' || !head.ContentLength || head.ContentLength > MAX_VIDEO_BYTES) return false;
  const data = head.Metadata || {}, duration = Number(data.duration);
  return Number.isFinite(duration) && duration > 0 && duration <= maxDuration && /^[a-f0-9]{64}$/.test(data.sha256 || '') &&
    data.codec === 'h264' && ['aac','none'].includes(data.audio) &&
    matches(data.validation, validation(actor, id, head.ContentLength, data.sha256, data.duration, data.audio));
}
export async function readyBrowserVideo(value: unknown, actor: number, maxDuration: number): Promise<ObjectVideoRef> {
  const proof = verifyBrowserVideoReceipt(value, actor), key = objectKey(actor, proof.upload_id);
  const stored = await head(key);
  if (!checked(stored, actor, proof.upload_id, maxDuration)) throw new RecordPhotoError('Video chưa được kiểm tra đầy đủ hoặc quá thời lượng cho hồ sơ này. Giữ tệp và thử lại.', 409);
  return { object_bucket: cloudflyVideoSettings().bucket, object_key: key, object_etag: stored!.ETag! };
}
export async function signBrowserVideo(actor: number, input: Record<string, unknown>, now = Date.now()) {
  if (!browserVideosEnabled()) throw new RecordPhotoError('Tải video trực tiếp chưa được bật.', 503);
  if (typeof input.upload_id !== 'string' || !UUID.test(input.upload_id) || !Number.isSafeInteger(input.bytes) || Number(input.bytes) <= 0 || Number(input.bytes) > MAX_VIDEO_BYTES ||
    typeof input.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.sha256) || ![60,180].includes(Number(input.max_duration))) throw new RecordPhotoError('Kiểm tra dung lượng và thông tin video.');
  const data: UploadTicket = { actor, id: input.upload_id, bytes: Number(input.bytes), sha256: input.sha256, max_duration: Number(input.max_duration), expires: now + 15 * 60_000 };
  const key = objectKey(actor, data.id), existing = await head(key);
  if (existing && (existing.ContentLength !== data.bytes || existing.Metadata?.sha256 !== data.sha256)) throw new RecordPhotoError('Mã tải này đã thuộc tệp khác. Chọn lại video.', 409);
  if (checked(existing, actor, data.id, data.max_duration)) return { receipt: receipt(actor, data.id) };
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const headers = { 'Content-Type': 'video/mp4', 'If-None-Match': '*', 'x-amz-acl': 'private', 'x-amz-meta-sha256': data.sha256 };
  const command = new PutObjectCommand({ Bucket: cloudflyVideoSettings().bucket, Key: key,
    ContentType: 'video/mp4', ContentLength: data.bytes, ACL: 'private', IfNoneMatch: '*', Metadata: { sha256: data.sha256 } });
  const url = await getSignedUrl(cloudflyVideoClient(), command, { expiresIn: 900,
    unhoistableHeaders: new Set(['x-amz-acl', 'x-amz-meta-sha256']) });
  return { url, headers, ticket: `${payload}.${signature(`upload:${payload}`)}` };
}
export async function inspectBrowserMp4(bytes: Uint8Array, maxDuration: number) {
  if (!bytes.length || bytes.length > MAX_VIDEO_BYTES) throw new RecordPhotoError('Video tối đa 45 MB.', 413);
  const input = new Input({ source: new BufferSource(bytes), formats: [MP4] });
  try {
    const video = await input.getPrimaryVideoTrack(), audios = await input.getAudioTracks();
    const duration = await input.computeDuration();
    if (!video || await video.getCodec() !== 'avc' || (await input.getVideoTracks()).length !== 1 || audios.length > 1 ||
      audios.length && await audios[0].getCodec() !== 'aac') throw new RecordPhotoError('Video cần là MP4/H.264 với âm thanh AAC.');
    if (!Number.isFinite(duration) || duration <= 0 || duration > maxDuration) throw new RecordPhotoError(`Video tối đa ${maxDuration} giây.`);
    const width = await video.getDisplayWidth(), height = await video.getDisplayHeight();
    if (!(width > 0 && height > 0) || Math.max(width, height) > 1920) throw new RecordPhotoError('Video cần có cạnh dài tối đa 1920 px.');
    return { duration: String(duration), codec: 'h264', audio: audios.length ? 'aac' : 'none' };
  } catch (error) {
    if (error instanceof RecordPhotoError) throw error;
    throw new RecordPhotoError('Không đọc được video MP4. Giữ tệp và chọn lại video.');
  } finally { input.dispose(); }
}
export async function completeBrowserVideo(actor: number, ticket: unknown, now = Date.now()) {
  if (typeof ticket !== 'string' || ticket.length > 1500) throw new RecordPhotoError('Phiên tải video không hợp lệ.');
  const [payload, proof, extra] = ticket.split('.');
  if (extra || !payload || !matches(proof, signature(`upload:${payload}`))) throw new RecordPhotoError('Phiên tải video không hợp lệ.');
  let data: UploadTicket;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { throw new RecordPhotoError('Phiên tải video không hợp lệ.'); }
  if (data.actor !== actor || !UUID.test(data.id) || ![60,180].includes(data.max_duration) || data.expires < now) throw new RecordPhotoError('Phiên tải video đã hết hạn. Bấm tải lại.', 409);
  const key = objectKey(actor, data.id), config = cloudflyVideoSettings(), client = cloudflyVideoClient();
  const stored = await head(key);
  if (!stored?.ETag || stored.ContentLength !== data.bytes || stored.Metadata?.sha256 !== data.sha256) throw new RecordPhotoError('Chưa nhận đủ video. Giữ form và bấm tải lại.', 409);
  if (checked(stored, actor, data.id, data.max_duration)) return { receipt: receipt(actor, data.id) };
  const remote = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key, IfMatch: stored.ETag }), { abortSignal: AbortSignal.timeout(45_000) });
  if (!remote.Body) throw new RecordPhotoError('Chưa đọc được video đã tải.', 502);
  const bytes = await readVideoBytes(new Response(remote.Body.transformToWebStream() as ReadableStream<Uint8Array>));
  if (bytes.length !== data.bytes || createHash('sha256').update(bytes).digest('hex') !== data.sha256) throw new RecordPhotoError('Nội dung video chưa khớp. Giữ tệp để thử lại.', 409);
  const media = await inspectBrowserMp4(bytes, data.max_duration);
  // No client-provided "verified" flag is trusted. Only this server can attest to parsed bytes.
  await client.send(new CopyObjectCommand({ Bucket: config.bucket, Key: key, CopySource: `${config.bucket}/${key}`, CopySourceIfMatch: stored.ETag,
    ACL: 'private', ContentType: 'video/mp4', MetadataDirective: 'REPLACE', Metadata: { ...media, sha256: data.sha256,
      validation: validation(actor, data.id, data.bytes, data.sha256, media.duration, media.audio) } }), { abortSignal: AbortSignal.timeout(30_000) });
  await readyBrowserVideo(receipt(actor, data.id), actor, data.max_duration);
  return { receipt: receipt(actor, data.id) };
}
