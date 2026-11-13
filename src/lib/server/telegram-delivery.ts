import 'server-only';
import sharp from 'sharp';
import { cloudinaryPhotoUrl, readCloudinaryPhoto } from './cloudinary-photos';
import { objectMediaUrl, readObjectMedia, boundedObjectBytes, legacyMediaObject } from './object-media';
import { objectVideoByteLength, objectVideoUrl, readObjectVideo } from './cloudfly-videos';
import { MAX_VIDEO_BYTES } from '@/lib/management/record-photos';
import type { Attachment } from './contract-notification-content';

export const TELEGRAM_MEDIA_TIMEOUT_MS = 120_000;
/** Multipart sendVideo of large files often needs longer than album URL posts. */
export const TELEGRAM_VIDEO_TIMEOUT_MS = 180_000;
export const TELEGRAM_TEXT_TIMEOUT_MS = 30_000;
export const TELEGRAM_DISPATCH_BUDGET_MS = 240_000;
export const TELEGRAM_ALBUM_BYTES = 2 * 1024 * 1024;
export const TELEGRAM_PHOTO_PASSTHROUGH_BYTES = 512 * 1024;
/** Telegram downloads URL media itself; non-photo URL payloads cap at 20 MB. */
export const TELEGRAM_URL_VIDEO_BYTES = 20 * 1024 * 1024;
const CLEANUP_MS = 10_000;

export class TelegramContinuation extends Error {}
export class TelegramDeliveryError extends Error {
  constructor(message: string, public definiteFailure = false, public description?: string, public method?: string,
    public retryAfterSeconds?: number, public durationMs?: number) { super(message); }
}
export function telegramErrorDescription(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const clean=Array.from(value,character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127?' ':character).join('');
  return clean.replace(/https?:\/\/[^\s"<>]+/gi, '[URL]').replace(/\b\d{5,20}:[A-Za-z0-9_-]{20,100}\b/g, '[TOKEN]').slice(0, 500);
}
/** Only a confirmed URL/media rejection permits replacing that request with an upload. */
export function canUploadRejectedTelegramMedia(error: unknown) {
  return error instanceof TelegramDeliveryError && error.definiteFailure && error.message === 'TELEGRAM_400'
    && /HTTP|URL|WEBPAGE|web page|remote file|wrong file|photo|image|media|content type/i.test(error.description || '');
}
export function canReplaceRejectedTelegramFile(error:unknown) {
  return error instanceof TelegramDeliveryError&&error.definiteFailure&&error.message==='TELEGRAM_400'
    &&/file[_ ](?:id|identifier|reference)|wrong.*file|FILE_REFERENCE/i.test(error.description||'');
}
export function requireTelegramTime(deadline: number, workMs: number) {
  if (Date.now() + workMs + CLEANUP_MS > deadline) throw new TelegramContinuation();
}

function telegramCallTimeoutMs(method: string) {
  if (method === 'sendMessage') return TELEGRAM_TEXT_TIMEOUT_MS;
  if (method === 'sendVideo') return TELEGRAM_VIDEO_TIMEOUT_MS;
  return TELEGRAM_MEDIA_TIMEOUT_MS;
}
/** A success includes valid message IDs and a fully consumed response body. Never retry an ambiguous POST. */
export interface TelegramMediaReceipt {file_id:string;kind:'photo'|'video'}
export async function telegramCall(token: string, method: string, body: FormData | Record<string, unknown>, send: typeof fetch, expectedMessages = 1,acceptedMedia?:(TelegramMediaReceipt|null)[]) {
  const form = body instanceof FormData;
  const started = Date.now();
  try {
    const response = await send(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', ...(form ? {} : { headers: { 'Content-Type': 'application/json' } }),
      body: form ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(telegramCallTimeoutMs(method)),
      redirect: 'error', cache: 'no-store',
    });
    const result = await response.json();
    if (result?.ok === false && Number.isInteger(result.error_code)) {
      const retry = result.parameters?.retry_after;
      throw new TelegramDeliveryError(`TELEGRAM_${result.error_code}`, true, telegramErrorDescription(result.description), method,
        Number.isSafeInteger(retry) && retry > 0 && retry <= 86400 ? retry : undefined);
    }
    if (!response.ok || result?.ok !== true) throw new TelegramDeliveryError('TELEGRAM_INVALID_RESPONSE');
    const messages = method === 'sendMediaGroup' ? result.result : [result.result];
    if (!Array.isArray(messages) || messages.length !== expectedMessages || messages.some(message => !Number.isSafeInteger(message?.message_id) || message.message_id <= 0)) throw new TelegramDeliveryError('TELEGRAM_INVALID_RESPONSE');
    if(acceptedMedia)for(const message of messages){
      const valid=(id:unknown):id is string=>typeof id==='string'&&id.length>0&&id.length<=4096;
      const photo=Array.isArray(message.photo)?message.photo.filter((p:{file_id?:unknown})=>valid(p?.file_id))
        .sort((a:{width?:number;height?:number},b:{width?:number;height?:number})=>Number(b.width||0)*Number(b.height||0)-Number(a.width||0)*Number(a.height||0))[0]:null;
      acceptedMedia.push(valid(message.video?.file_id)?{kind:'video',file_id:message.video.file_id}:photo?{kind:'photo',file_id:photo.file_id}:null);
    }
    return messages.map(message => Number(message.message_id)) as number[];
  } catch (error) {
    if (error instanceof TelegramDeliveryError) { error.method ??= method; error.durationMs = Date.now() - started; throw error; }
    throw new TelegramDeliveryError(error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'TELEGRAM_TIMEOUT' : 'TELEGRAM_NETWORK', false, undefined, method, undefined, Date.now() - started);
  }
}

export interface TelegramAttachment extends Attachment {telegram_file_id?:string;telegram_cache_key?:string}
export interface Media { data?: Buffer; url?: string; file_id?:string; cache_key?:string; type: string; source_bytes?:number }
const mediaBytes = (file: Media) => file.data?.length || 0;
async function videoByUrl(photo: Attachment): Promise<Media | null> {
  try {
    if (photo.object_key && photo.object_bucket && photo.object_etag) {
      const size = await objectVideoByteLength({ object_bucket: photo.object_bucket, object_key: photo.object_key, object_etag: photo.object_etag });
      if (size > TELEGRAM_URL_VIDEO_BYTES) return null;
      return { url: await objectVideoUrl({ object_bucket: photo.object_bucket, object_key: photo.object_key, object_etag: photo.object_etag }), type: 'video/mp4' };
    }
    if (photo.cloudinary_public_id && photo.cloudinary_cloud_name) {
      const source={cloudinary_public_id:photo.cloudinary_public_id,cloudinary_cloud_name:photo.cloudinary_cloud_name,cloudinary_version:Number(photo.cloudinary_version),mime_type:'video/mp4'};
      const archived=await legacyMediaObject(source);
      if(archived)return Number(archived.storage_bytes)>0&&Number(archived.storage_bytes)<=TELEGRAM_URL_VIDEO_BYTES
        ?{url:await objectMediaUrl(archived,'video/mp4',600),type:'video/mp4'}:null;
      const url = cloudinaryPhotoUrl(source,600);
      const head = await fetch(url, { method: 'HEAD', cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(10_000) });
      const size = Number(head.headers.get('content-length'));
      if (!head.ok || !Number.isFinite(size) || size <= 0 || size > TELEGRAM_URL_VIDEO_BYTES) return null;
      return { url, type: 'video/mp4' };
    }
  } catch { return null; }
  return null;
}
async function loadMedia(photo: TelegramAttachment, upload: boolean): Promise<Media> {
  if(!upload&&photo.telegram_file_id)return {file_id:photo.telegram_file_id,type:photo.mime_type};
  // New photos use bounded multipart uploads. Telegram no longer has to fetch
  // private photo URLs; acknowledged file IDs still avoid reading the source.
  if (!upload && photo.mime_type === 'video/mp4') {
    const remote = await videoByUrl(photo);
    if (remote) return remote;
  }
  let data: Buffer | undefined;
  // Source GETs are idempotent. Retry a failed read once, before any Telegram POST.
  for (let attempt = 0; attempt < 2; attempt++) {
    try { data = photo.object_key
    ? photo.mime_type==='video/mp4'?await readObjectVideo({ object_bucket: photo.object_bucket!, object_key: photo.object_key, object_etag: photo.object_etag! })
      :await boundedObjectBytes((await readObjectMedia({ object_bucket: photo.object_bucket!, object_key: photo.object_key, object_etag: photo.object_etag! },photo.mime_type)).body!,2*1024*1024)
    : photo.cloudinary_public_id
    ? Buffer.from(await (await readCloudinaryPhoto({ cloudinary_public_id: photo.cloudinary_public_id, cloudinary_cloud_name: photo.cloudinary_cloud_name!, cloudinary_version: Number(photo.cloudinary_version), mime_type: photo.mime_type })).arrayBuffer())
    : Buffer.from(photo.bytes || '', 'base64');
      break;
    } catch { if (attempt === 1) throw new TelegramDeliveryError('MEDIA_FETCH_FAILED', true); }
  }
  if (!data) throw new TelegramDeliveryError('MEDIA_FETCH_FAILED', true);
  if (!data.length || data.length > (photo.mime_type === 'video/mp4' ? MAX_VIDEO_BYTES : 2 * 1024 * 1024)) throw new TelegramDeliveryError('PHOTO_SIZE', true);
  const sourceBytes = data.length;
  if (photo.mime_type !== 'video/mp4' && (photo.mime_type !== 'image/jpeg' || data.length > TELEGRAM_PHOTO_PASSTHROUGH_BYTES)) {
    // Preserve document resolution and colour detail. Originals are never modified.
    const document = /identity|passport|license|registration|document|receipt|bill/i.test(photo.slot);
    try {
      const prepared = await sharp(data, { limitInputPixels: 40_000_000, animated: false }).rotate()
        .resize({ width: document ? 1800 : 1600, height: document ? 1800 : 1600, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#fff' }).jpeg({ quality: document ? 84 : 80, chromaSubsampling: document ? '4:4:4' : '4:2:0' }).toBuffer();
      if (photo.mime_type !== 'image/jpeg' || prepared.length < data.length) data = prepared;
    } catch { throw new TelegramDeliveryError('MEDIA_FETCH_FAILED', true); }
  }
  if (photo.mime_type !== 'video/mp4' && data.length > TELEGRAM_ALBUM_BYTES) throw new TelegramDeliveryError('PHOTO_SIZE', true);
  return { data, type: photo.mime_type === 'video/mp4' ? 'video/mp4' : 'image/jpeg', source_bytes: sourceBytes };
}
/** Preserve attachment order, cap uploaded photo albums by bytes/count and upload each video separately. */
export async function* telegramMediaBatches(photos: TelegramAttachment[], offset: number, deadline: number, upload = false): AsyncGenerator<Media[]> {
  let batch: Media[] = [], bytes = 0;
  while (offset < photos.length) {
    const video = photos[offset].mime_type === 'video/mp4';
    if (video) {
      if (batch.length) { yield batch; batch = []; bytes = 0; }
      requireTelegramTime(deadline, TELEGRAM_MEDIA_TIMEOUT_MS + 5_000);
      const media = {...await loadMedia(photos[offset], upload),cache_key:photos[offset].telegram_cache_key};
      if (!media.url&&!media.file_id) requireTelegramTime(deadline, TELEGRAM_VIDEO_TIMEOUT_MS + 45_000);
      else requireTelegramTime(deadline, TELEGRAM_VIDEO_TIMEOUT_MS + 5_000);
      yield [media];
      offset += 1;
      continue;
    }
    if (batch.length === 10) { yield batch; batch = []; bytes = 0; }
    const chunk: TelegramAttachment[] = [];
    for (let i = offset; i < photos.length && chunk.length < Math.min(3, 10 - batch.length) && photos[i].mime_type !== 'video/mp4'; i++) chunk.push(photos[i]);
    try {
      requireTelegramTime(deadline, TELEGRAM_MEDIA_TIMEOUT_MS + (chunk.some(photo => !photo.telegram_file_id && (photo.object_key || photo.cloudinary_public_id)) ? 65_000 : 5_000));
    } catch (error) {
      // Slow source reads must not discard a prepared partial album and restart
      // it forever. Checkpoint that album before handing off to the next worker.
      if (batch.length) yield batch;
      throw error;
    }
    for (const file of await Promise.all(chunk.map(async photo => ({...await loadMedia(photo, upload),cache_key:photo.telegram_cache_key})))) {
      if (batch.length && bytes + mediaBytes(file) > TELEGRAM_ALBUM_BYTES) { yield batch; batch = []; bytes = 0; }
      batch.push(file); bytes += mediaBytes(file);
      if (batch.length === 10) { yield batch; batch = []; bytes = 0; }
    }
    offset += chunk.length;
  }
  if (batch.length) yield batch;
}
