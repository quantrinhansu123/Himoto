import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { S3Client, HeadObjectCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MAX_VIDEO_BYTES } from '@/lib/management/video-media';
import { RecordPhotoError } from './record-photos';
import type { CloudPhotoReceipt } from './cloudinary-photos';

export interface ObjectVideoRef { object_bucket: string; object_key: string; object_etag: string }
export interface VideoMetadata {
  resource_type?: string; format?: string; version?: number; bytes?: number; duration?: number;
  codec?: string;
  video?: { codec?: string };
}
const KEY_PATTERN = /^himoto\/videos\/[a-z0-9_-]+\/[1-9]\d*\/[0-9a-f-]{36}\/v[1-9]\d*\.mp4$/i;

export function cloudflyVideosEnabled() {
  const provider = process.env.VIDEO_STORAGE_PROVIDER || 'cloudinary';
  if (!['cloudinary', 'cloudfly'].includes(provider)) throw new RecordPhotoError('Cấu hình nơi lưu video chưa hợp lệ.', 503);
  return provider === 'cloudfly';
}
export function cloudflyVideoSettings() {
  const endpoint = process.env.CLOUDFLY_S3_ENDPOINT?.trim();
  const bucket = process.env.CLOUDFLY_S3_BUCKET?.trim();
  const accessKeyId = process.env.CLOUDFLY_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.CLOUDFLY_S3_SECRET_ACCESS_KEY?.trim();
  if (endpoint !== 'https://s3.cloudfly.vn' || !bucket || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || !accessKeyId || !secretAccessKey) {
    throw new RecordPhotoError('Chưa cấu hình đủ kho video CloudFly. Giữ tệp và thử lại sau.', 503);
  }
  return { endpoint, bucket, region: process.env.CLOUDFLY_S3_REGION?.trim() || 'hn', accessKeyId, secretAccessKey };
}
const settings = cloudflyVideoSettings;
let cached: { fingerprint: string; client: S3Client } | undefined;
export function cloudflyVideoClient() {
  const config = settings(), fingerprint = createHash('sha256').update(JSON.stringify(config)).digest('hex');
  if (cached?.fingerprint !== fingerprint) {
    cached?.client.destroy();
    cached = { fingerprint, client: new S3Client({
      endpoint: config.endpoint, region: config.region, forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', maxAttempts: 2,
    }) };
  }
  return cached.client;
}
export function convertedVideoKey(receipt: CloudPhotoReceipt, cloudName: string) {
  const path = receipt.public_id.match(/^himoto\/management-video\/([1-9]\d*)\/([0-9a-f-]{36})$/i);
  if (receipt.resource_type !== 'video' || !path || !/^[a-z0-9_-]+$/i.test(cloudName) || !Number.isSafeInteger(receipt.version) || receipt.version < 1) {
    throw new RecordPhotoError('Thông tin video không hợp lệ.');
  }
  return `himoto/videos/${cloudName}/${path[1]}/${path[2]}/v${receipt.version}.mp4`;
}
function requireRef(ref: ObjectVideoRef) {
  if (ref.object_bucket !== settings().bucket || !KEY_PATTERN.test(ref.object_key) || !ref.object_etag) {
    throw new RecordPhotoError('Kho video không khớp cấu hình hiện tại.', 503);
  }
}
/** A bounded reader also protects against a misleading Content-Length header. */
export async function readVideoBytes(response: Response) {
  if (!response.ok || !response.body) throw new RecordPhotoError('Không tải được video để lưu vào kho.', 502);
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.length;
      if (size > MAX_VIDEO_BYTES) { await reader.cancel(); throw new RecordPhotoError('Video tối đa 45 MB.', 413); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  if (!size) throw new RecordPhotoError('Video rỗng, giữ tệp và thử lại.');
  return Buffer.concat(chunks);
}
async function findVideo(key: string, maxDuration: number) {
  try {
    const asset = await cloudflyVideoClient().send(new HeadObjectCommand({ Bucket: settings().bucket, Key: key }), { abortSignal: AbortSignal.timeout(20_000) });
    const duration = Number(asset.Metadata?.duration);
    if (asset.ContentType !== 'video/mp4' || !asset.ContentLength || asset.ContentLength > MAX_VIDEO_BYTES || !asset.ETag ||
      !Number.isFinite(duration) || duration <= 0 || duration > maxDuration || !/^[a-f0-9]{64}$/.test(asset.Metadata?.sha256 || '')) {
      throw new RecordPhotoError('Video trong kho chưa hợp lệ, giữ tệp để kiểm tra.', 409);
    }
    return { object_bucket: settings().bucket, object_key: key, object_etag: asset.ETag };
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}
/** Keep Cloudinary receipts stable across retries, including after temporary conversion cleanup. */
export async function storeConvertedVideo(receipt: CloudPhotoReceipt, cloudName: string, maxDuration: number,
  metadata: () => Promise<VideoMetadata>, download: () => Promise<Response>): Promise<ObjectVideoRef> {
  const key = convertedVideoKey(receipt, cloudName);
  const existing = await findVideo(key, maxDuration);
  if (existing) return existing;
  const asset = await metadata();
  if (asset.resource_type !== 'video' || asset.format !== 'mp4' || Number(asset.version) !== receipt.version ||
    !Number.isSafeInteger(asset.bytes) || Number(asset.bytes) <= 0 || Number(asset.bytes) > MAX_VIDEO_BYTES || !Number.isFinite(asset.duration) || Number(asset.duration) <= 0 || Number(asset.duration) > maxDuration ||
    ((asset.codec || asset.video?.codec) && !['h264', 'avc1'].includes((asset.codec || asset.video?.codec)!))) {
    throw new RecordPhotoError(`Video cần là MP4/H.264, tối đa 45 MB và ${maxDuration} giây.`);
  }
  const bytes = await readVideoBytes(await download());
  if (bytes.length !== asset.bytes || bytes.length < 12 || bytes.toString('ascii', 4, 8) !== 'ftyp') {
    throw new RecordPhotoError('Nội dung video chưa đầy đủ hoặc không phải MP4. Giữ tệp và thử lại.', 502);
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  try {
    await cloudflyVideoClient().send(new PutObjectCommand({
      Bucket: settings().bucket, Key: key, Body: bytes, ContentType: 'video/mp4', ACL: 'private',
      ContentLength: bytes.length, ContentMD5: createHash('md5').update(bytes).digest('base64'),
      IfNoneMatch: '*', Metadata: { duration: String(asset.duration), sha256 },
    }), { abortSignal: AbortSignal.timeout(90_000) });
  } catch (error) {
    // An acknowledged concurrent upload of the same conversion is safe to reuse.
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412) throw error;
  }
  const stored = await findVideo(key, maxDuration);
  if (!stored) throw new RecordPhotoError('Chưa xác nhận được video trong CloudFly. Giữ tệp và thử lại.', 502);
  const verified = await cloudflyVideoClient().send(new HeadObjectCommand({ Bucket: stored.object_bucket, Key: key }), { abortSignal: AbortSignal.timeout(20_000) });
  if (verified.ContentLength !== bytes.length || verified.Metadata?.sha256 !== sha256) throw new RecordPhotoError('Kiểm tra video CloudFly chưa khớp.', 502);
  return stored;
}
/** Call only after the authenticated route has checked the record's RLS scope. */
export async function objectVideoUrl(ref: ObjectVideoRef) {
  requireRef(ref);
  return getSignedUrl(cloudflyVideoClient(), new GetObjectCommand({
    Bucket: ref.object_bucket, Key: ref.object_key,
    ResponseContentType: 'video/mp4', ResponseContentDisposition: 'inline; filename="video-himoto.mp4"',
    ResponseCacheControl: 'private, no-store',
  }), { expiresIn: 300 });
}
/** Cheap size check so Telegram can receive a signed URL instead of a Vercel re-upload. */
export async function objectVideoByteLength(ref: ObjectVideoRef) {
  requireRef(ref);
  const head = await cloudflyVideoClient().send(new HeadObjectCommand({
    Bucket: ref.object_bucket, Key: ref.object_key,
  }), { abortSignal: AbortSignal.timeout(20_000) });
  if (head.ContentType !== 'video/mp4' || !head.ContentLength || head.ContentLength > MAX_VIDEO_BYTES || head.ETag !== ref.object_etag) {
    throw new RecordPhotoError('Video trong kho không hợp lệ.', 502);
  }
  return head.ContentLength;
}
export async function readObjectVideo(ref: ObjectVideoRef) {
  requireRef(ref);
  const remote = await cloudflyVideoClient().send(new GetObjectCommand({ Bucket: ref.object_bucket, Key: ref.object_key, IfMatch: ref.object_etag }), { abortSignal: AbortSignal.timeout(45_000) });
  if (!remote.Body || !remote.ContentLength || remote.ContentLength > MAX_VIDEO_BYTES) throw new RecordPhotoError('Video trong kho không hợp lệ.', 502);
  const bytes = await readVideoBytes(new Response(remote.Body.transformToWebStream() as ReadableStream<Uint8Array>));
  if (bytes.length !== remote.ContentLength) throw new RecordPhotoError('Chưa tải đủ video từ kho.', 502);
  return bytes;
}
export async function hasConvertedVideo(receipt: CloudPhotoReceipt, cloudName: string) {
  return Boolean(await findVideo(convertedVideoKey(receipt, cloudName), 180));
}
/** Admin diagnostic: prove deployed credentials can write/read privately without touching business records. */
export async function probeCloudflyVideoStorage() {
  const config = settings(), client = cloudflyVideoClient();
  const key = `himoto/storage-checks/${randomUUID()}.bin`;
  const bytes = Buffer.from(`HIMOTO storage probe ${randomUUID()}`);
  const command = { Bucket: config.bucket, Key: key };
  try {
    await client.send(new PutObjectCommand({ ...command, Body: bytes, ContentLength: bytes.length,
      ContentType: 'application/octet-stream', ACL: 'private', IfNoneMatch: '*',
      ContentMD5: createHash('md5').update(bytes).digest('base64'),
    }), { abortSignal: AbortSignal.timeout(15_000) });
    const head = await client.send(new HeadObjectCommand(command), { abortSignal: AbortSignal.timeout(10_000) });
    const range = await client.send(new GetObjectCommand({ ...command, Range: 'bytes=0-15', IfMatch: head.ETag }), { abortSignal: AbortSignal.timeout(10_000) });
    if (head.ContentLength !== bytes.length || range.$metadata.httpStatusCode !== 206 || range.ContentLength !== 16 ||
      !range.Body || !Buffer.from(await range.Body.transformToByteArray()).equals(bytes.subarray(0, 16))) {
      throw new RecordPhotoError('Kiểm tra đọc/ghi kho video chưa khớp.', 502);
    }
    const anonymous = await fetch(`${config.endpoint}/${config.bucket}/${key}`, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    await anonymous.body?.cancel();
    if (![403, 404].includes(anonymous.status)) throw new RecordPhotoError('Tệp kiểm tra kho video đang truy cập được công khai.', 503);
    return { provider: 'cloudfly', write: true, read: true, range: true, private: true, temporary_file_removed: true };
  } finally {
    // The key is generated here and is never linked to a business record, even if PUT times out.
    await client.send(new DeleteObjectCommand(command), { abortSignal: AbortSignal.timeout(10_000) });
  }
}
