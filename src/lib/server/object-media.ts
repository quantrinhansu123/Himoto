import 'server-only';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import type { PoolClient } from 'pg';
import { cloudflyVideoClient, cloudflyVideoSettings } from './cloudfly-videos';
import { ownerDatabase } from './himoto-database';
import { RecordPhotoError, validatePhotoBytes } from './record-photos';

export interface ObjectMediaRef { object_bucket: string; object_key: string; object_etag: string }
export interface StoredPhoto extends ObjectMediaRef { storage_sha256: string; storage_bytes: number; mime_type: string }
export interface LegacyMediaRef { cloudinary_cloud_name: string; cloudinary_public_id: string; cloudinary_version: number; mime_type?: string }
export interface ObjectPhotoReceipt { public_id: string; version: number; signature: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4' };
const PHOTO_KEY = /^himoto\/photos\/[1-9]\d*\/[0-9a-f-]{36}\/v1\.(jpg|png|webp)$/i;
const LEGACY_KEY = /^himoto\/legacy\/(cloudinary|postgres)\/[a-f0-9]{64}\.(jpg|png|webp|mp4)$/;
const PREVIEW_KEY = /^himoto\/previews\/[a-f0-9]{64}\.jpg$/;
const maximum = (mime: string) => mime === 'video/mp4' ? 45 * 1024 * 1024 : 2 * 1024 * 1024;
export function cloudflyPhotosEnabled() {
  const provider = process.env.PHOTO_STORAGE_PROVIDER || process.env.VIDEO_STORAGE_PROVIDER || 'cloudinary';
  if (!['cloudinary', 'cloudfly'].includes(provider)) throw new RecordPhotoError('Cấu hình nơi lưu ảnh chưa hợp lệ.', 503);
  return provider === 'cloudfly';
}
function signature(value: string) {
  const secret = process.env.MANAGEMENT_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new RecordPhotoError('Chưa cấu hình xác minh kho ảnh.', 503);
  return createHmac('sha256', secret).update(`himoto-object-photo-v1:${value}`).digest('hex');
}
function photoReceipt(actor: number, id: string): ObjectPhotoReceipt {
  return { public_id: `himoto/management/${actor}/${id}`, version: 1,
    signature: signature(`${cloudflyVideoSettings().bucket}:${actor}:${id}`) };
}
export function verifyObjectPhotoReceipt(value: ObjectPhotoReceipt, actor: number) {
  const id = value.public_id.match(new RegExp(`^himoto/management/${actor}/([0-9a-f-]{36})$`, 'i'))?.[1];
  if (!id || !UUID.test(id) || value.version !== 1 || !/^[a-f0-9]{64}$/.test(value.signature) ||
      !timingSafeEqual(Buffer.from(value.signature), Buffer.from(photoReceipt(actor, id).signature))) {
    throw new RecordPhotoError('Biên nhận kho ảnh không thuộc tài khoản hoặc đã thay đổi.');
  }
  return id;
}
export async function storeObjectPhoto(bytes: Buffer, mime: string, actor: number, id: string = randomUUID()): Promise<StoredPhoto> {
  validatePhotoBytes(mime, bytes);
  if (!Number.isSafeInteger(actor) || actor < 1 || !UUID.test(id)) throw new RecordPhotoError('Mã tải ảnh không hợp lệ.');
  try {
    const image = await sharp(bytes, { limitInputPixels: 40_000_000, animated: false }).metadata();
    if (!image.width || !image.height || !['jpeg', 'png', 'webp'].includes(image.format || '') || (image.pages || 1) > 1) throw Error('Invalid image');
  } catch { throw new RecordPhotoError('Ảnh không đọc được hoặc vượt giới hạn kích thước. Chọn lại ảnh JPEG, PNG hoặc WebP.', 415); }
  const config = cloudflyVideoSettings(), sha256 = createHash('sha256').update(bytes).digest('hex');
  const key = `himoto/photos/${actor}/${id}/v1.${extensions[mime]}`;
  const stored = await putVerifiedObject(key, bytes, mime, sha256);
  return { object_bucket: config.bucket, object_key: key, object_etag: stored,
    storage_sha256: sha256, storage_bytes: bytes.length, mime_type: mime };
}
/** Conditional PUT plus a complete GET/hash check makes retries immutable. */
export async function putVerifiedObject(key: string, bytes: Buffer, mime: string, sha256 = createHash('sha256').update(bytes).digest('hex')) {
  const config = cloudflyVideoSettings(), client = cloudflyVideoClient();
  if ((!PHOTO_KEY.test(key) && !LEGACY_KEY.test(key) && !PREVIEW_KEY.test(key)) || !extensions[mime] || !bytes.length || bytes.length > maximum(mime)) throw new RecordPhotoError('Tệp kho ảnh không hợp lệ.');
  try {
    await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: bytes, ContentLength: bytes.length,
      ContentType: mime, ACL: 'private', IfNoneMatch: '*', ContentMD5: createHash('md5').update(bytes).digest('base64'), Metadata: { sha256 } }),
    { abortSignal: AbortSignal.timeout(30_000) });
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412) throw error;
  }
  const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }), { abortSignal: AbortSignal.timeout(10_000) });
  if (!head.ETag || head.ContentType !== mime || head.ContentLength !== bytes.length || head.Metadata?.sha256 !== sha256) throw new RecordPhotoError('Tệp trên kho chưa khớp nội dung đã chọn. Giữ tệp để đối chiếu.', 409);
  const remote = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key, IfMatch: head.ETag }), { abortSignal: AbortSignal.timeout(30_000) });
  if (!remote.Body) throw new RecordPhotoError('Chưa xác minh được ảnh đã tải.', 502);
  const verified = await boundedObjectBytes(remote.Body.transformToWebStream() as ReadableStream<Uint8Array>, maximum(mime));
  if (verified.length !== bytes.length || createHash('sha256').update(verified).digest('hex') !== sha256) throw new RecordPhotoError('Nội dung tệp sau tải chưa khớp. Giữ tệp để thử lại.', 502);
  return head.ETag;
}
export async function uploadObjectPhoto(bytes: Buffer, mime: string, actor: number, id: string) {
  if(mime!=='image/jpeg'){
    validatePhotoBytes(mime,bytes);
    try{bytes=await sharp(bytes,{limitInputPixels:40_000_000,animated:false}).rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).jpeg({quality:85}).toBuffer();}
    catch{throw new RecordPhotoError('Không chuyển được ảnh sang JPEG. Chọn lại ảnh.',415);}
    mime='image/jpeg';
  }
  await storeObjectPhoto(bytes, mime, actor, id);
  return photoReceipt(actor, id);
}
export async function readyObjectPhoto(receipt: ObjectPhotoReceipt, actor: number): Promise<StoredPhoto> {
  const id = verifyObjectPhotoReceipt(receipt, actor), config = cloudflyVideoSettings();
  // Web prepares JPEG; raw PNG/WebP saves use storeObjectPhoto directly.
  const key = `himoto/photos/${actor}/${id}/v1.jpg`;
  const stored = await cloudflyVideoClient().send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }), { abortSignal: AbortSignal.timeout(10_000) });
  if (!stored.ETag || stored.ContentType !== 'image/jpeg' || !stored.ContentLength || stored.ContentLength > maximum('image/jpeg') || !/^[a-f0-9]{64}$/.test(stored.Metadata?.sha256 || '')) throw new RecordPhotoError('Ảnh chưa được tải đầy đủ. Giữ form và tải lại.', 409);
  return { object_bucket: config.bucket, object_key: key, object_etag: stored.ETag, storage_sha256: stored.Metadata!.sha256,
    storage_bytes: stored.ContentLength, mime_type: 'image/jpeg' };
}
function requireObject(ref: ObjectMediaRef, mime: string) {
  if (ref.object_bucket !== cloudflyVideoSettings().bucket || (!PHOTO_KEY.test(ref.object_key) && !LEGACY_KEY.test(ref.object_key) && !PREVIEW_KEY.test(ref.object_key)) || !ref.object_etag || !extensions[mime] || !ref.object_key.endsWith(`.${extensions[mime]}`)) throw new RecordPhotoError('Tham chiếu kho dữ liệu không hợp lệ.', 503);
}
/** One fixed rendition, cached privately in S3; arbitrary resize parameters are never accepted. */
export async function photoPreviewUrl(identity: string, read: () => Promise<Buffer>) {
  const key=`himoto/previews/${createHash('sha256').update(`384-q65-v1:${identity}`).digest('hex')}.jpg`,config=cloudflyVideoSettings();
  try {
    const head=await cloudflyVideoClient().send(new HeadObjectCommand({Bucket:config.bucket,Key:key}),{abortSignal:AbortSignal.timeout(10000)});
    if(!head.ETag||head.ContentType!=='image/jpeg'||!head.ContentLength||head.ContentLength>98304)throw new RecordPhotoError('Ảnh xem trước trong kho chưa hợp lệ.',502);
    return objectMediaUrl({object_bucket:config.bucket,object_key:key,object_etag:head.ETag},'image/jpeg');
  }catch(error){if((error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode!==404)throw error;}
  const source=await read();
  let bytes:Buffer;
  try{bytes=await sharp(source,{limitInputPixels:40000000,animated:false}).rotate().resize({width:384,height:384,fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).jpeg({quality:65}).toBuffer();}
  catch{throw new RecordPhotoError('Không tạo được ảnh xem trước. Mở ảnh gốc để kiểm tra.',415);}
  if(!bytes.length||bytes.length>98304)throw new RecordPhotoError('Ảnh xem trước vượt giới hạn. Mở ảnh gốc để kiểm tra.',413);
  const etag=await putVerifiedObject(key,bytes,'image/jpeg');
  return objectMediaUrl({object_bucket:config.bucket,object_key:key,object_etag:etag},'image/jpeg');
}
export async function objectPhotoPreviewUrl(ref:ObjectMediaRef,mime:string) {
  requireObject(ref,mime);
  return photoPreviewUrl(`${ref.object_bucket}:${ref.object_key}:${ref.object_etag}`,async()=>boundedObjectBytes((await readObjectMedia(ref,mime)).body!,2097152));
}
export async function objectMediaUrl(ref: ObjectMediaRef, mime: string, expires = 300) {
  requireObject(ref, mime);
  return getSignedUrl(cloudflyVideoClient(), new GetObjectCommand({ Bucket: ref.object_bucket, Key: ref.object_key,
    ResponseContentType: mime, ResponseContentDisposition: `inline; filename="ho-so.${extensions[mime]}"`, ResponseCacheControl: 'private, max-age=300' }), { expiresIn: Math.min(600, expires) });
}
export async function readObjectMedia(ref: ObjectMediaRef, mime: string, range?: string | null) {
  requireObject(ref, mime);
  const remote = await cloudflyVideoClient().send(new GetObjectCommand({ Bucket: ref.object_bucket, Key: ref.object_key, IfMatch: ref.object_etag, ...(range ? { Range: range } : {}) }), { abortSignal: AbortSignal.timeout(30_000) });
  if (!remote.Body || !remote.ContentLength || remote.ContentLength > maximum(mime) || remote.ETag !== ref.object_etag || remote.ContentType !== mime) throw new RecordPhotoError('Tệp lưu trữ không khớp phiên bản đã ghi nhận.', 502);
  return new Response(remote.Body.transformToWebStream() as ReadableStream<Uint8Array>, { status: remote.$metadata.httpStatusCode === 206 ? 206 : 200,
    headers: { 'Content-Type': mime, 'Content-Length': String(remote.ContentLength), ...(remote.ContentRange ? { 'Content-Range': remote.ContentRange } : {}) } });
}
export async function boundedObjectBytes(body: ReadableStream<Uint8Array>, limit: number) {
  const reader = body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length;
    if (size > limit) { await reader.cancel(); throw new RecordPhotoError('Tệp lưu trữ vượt giới hạn.', 413); } chunks.push(part.value); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
/** Resolve after the caller's scoped record read. Historical refs/hashes stay immutable. */
export async function legacyMediaObject(photo: LegacyMediaRef, database: Pick<PoolClient, 'query'> = ownerDatabase): Promise<(ObjectMediaRef & { storage_bytes: number }) | null> {
  const enabled=process.env.MEDIA_ARCHIVE_ENABLED?process.env.MEDIA_ARCHIVE_ENABLED==='on':process.env.VIDEO_STORAGE_PROVIDER==='cloudfly'||cloudflyPhotosEnabled();
  if (!enabled) return null;
  const version=Number(photo.cloudinary_version);
  const row = (await database.query(`SELECT object_bucket,object_key,object_etag,storage_bytes FROM himoto.management_media_archive
    WHERE source_cloud=$1 AND source_public_id=$2 AND ($3::bigint IS NULL OR source_version=$3) AND mime_type=$4 AND verified_at IS NOT NULL
    ORDER BY source_version DESC LIMIT 1`,
  [photo.cloudinary_cloud_name, photo.cloudinary_public_id, Number.isSafeInteger(version)&&version>0?version:null, photo.mime_type || 'image/jpeg'])).rows[0];
  return row || null;
}
export async function saveObjectRecordPhoto(client: Pick<PoolClient, 'query'>, entity: string, id: number, slot: string, actor: number, stored: StoredPhoto) {
  await client.query(`INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by,object_bucket,object_key,object_etag,storage_sha256,storage_bytes)
    VALUES($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10) ON CONFLICT(entity_type,entity_id,slot)
    DO UPDATE SET mime_type=EXCLUDED.mime_type,data=NULL,updated_by=EXCLUDED.updated_by,updated_at=now(),
      cloudinary_public_id=NULL,cloudinary_cloud_name=NULL,cloudinary_version=NULL,object_bucket=EXCLUDED.object_bucket,object_key=EXCLUDED.object_key,
      object_etag=EXCLUDED.object_etag,storage_sha256=EXCLUDED.storage_sha256,storage_bytes=EXCLUDED.storage_bytes`,
  [entity,id,slot,stored.mime_type,actor,stored.object_bucket,stored.object_key,stored.object_etag,stored.storage_sha256,stored.storage_bytes]);
}
