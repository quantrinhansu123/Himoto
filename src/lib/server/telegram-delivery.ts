import 'server-only';
import { cloudinaryPhotoUrl, readCloudinaryPhoto } from './cloudinary-photos';
import { readObjectVideo } from './cloudfly-videos';
import { MAX_VIDEO_BYTES } from '@/lib/management/record-photos';
import type { Attachment } from './contract-notification-content';

export const TELEGRAM_MEDIA_TIMEOUT_MS = 120_000;
export const TELEGRAM_TEXT_TIMEOUT_MS = 30_000;
export const TELEGRAM_DISPATCH_BUDGET_MS = 240_000;
export const TELEGRAM_ALBUM_BYTES = 4 * 1024 * 1024;
const CLEANUP_MS = 10_000;

export class TelegramContinuation extends Error {}
export class TelegramDeliveryError extends Error {
  constructor(message: string, public definiteFailure = false) { super(message); }
}
export function requireTelegramTime(deadline: number, workMs: number) {
  if (Date.now() + workMs + CLEANUP_MS > deadline) throw new TelegramContinuation();
}

/** A success includes valid message IDs and a fully consumed response body. Never retry an ambiguous POST. */
export async function telegramCall(token: string, method: string, body: FormData | Record<string, unknown>, send: typeof fetch, expectedMessages = 1) {
  const form = body instanceof FormData;
  try {
    const response = await send(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', ...(form ? {} : { headers: { 'Content-Type': 'application/json' } }),
      body: form ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(method === 'sendMessage' ? TELEGRAM_TEXT_TIMEOUT_MS : TELEGRAM_MEDIA_TIMEOUT_MS),
      redirect: 'error', cache: 'no-store',
    });
    const result = await response.json();
    if (result?.ok === false && Number.isInteger(result.error_code)) throw new TelegramDeliveryError(`TELEGRAM_${result.error_code}`, true);
    if (!response.ok || result?.ok !== true) throw new TelegramDeliveryError('TELEGRAM_INVALID_RESPONSE');
    const messages = method === 'sendMediaGroup' ? result.result : [result.result];
    if (!Array.isArray(messages) || messages.length !== expectedMessages || messages.some(message => !Number.isSafeInteger(message?.message_id) || message.message_id <= 0)) throw new TelegramDeliveryError('TELEGRAM_INVALID_RESPONSE');
    return messages.map(message => Number(message.message_id)) as number[];
  } catch (error) {
    if (error instanceof TelegramDeliveryError) throw error;
    throw new TelegramDeliveryError(error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'TELEGRAM_TIMEOUT' : 'TELEGRAM_NETWORK');
  }
}

export interface Media { data?: Buffer; url?: string; type: string }
const mediaBytes = (file: Media) => file.data?.length || 0;
async function loadMedia(photo: Attachment): Promise<Media> {
  // Authenticated Cloudinary photos are handed to Telegram as a signed URL so
  // Vercel does not download+reupload every file. Videos stay as bytes because
  // Telegram URL fetches cap below the 45 MB / 60s contract limit.
  if (photo.cloudinary_public_id && photo.mime_type !== 'video/mp4') {
    return { url: cloudinaryPhotoUrl(photo), type: photo.mime_type };
  }
  const data = photo.object_key
    ? await readObjectVideo({ object_bucket: photo.object_bucket!, object_key: photo.object_key, object_etag: photo.object_etag! })
    : photo.cloudinary_public_id
    ? Buffer.from(await (await readCloudinaryPhoto({ cloudinary_public_id: photo.cloudinary_public_id, cloudinary_cloud_name: photo.cloudinary_cloud_name!, cloudinary_version: Number(photo.cloudinary_version), mime_type: photo.mime_type })).arrayBuffer())
    : Buffer.from(photo.bytes || '', 'base64');
  if (!data.length || data.length > (photo.mime_type === 'video/mp4' ? MAX_VIDEO_BYTES : 2 * 1024 * 1024)) throw new TelegramDeliveryError('PHOTO_SIZE', true);
  return { data, type: photo.mime_type };
}
/** Preserve attachment order, cap uploaded photo albums by bytes/count and upload each video separately. */
export async function* telegramMediaBatches(photos: Attachment[], offset: number, deadline: number): AsyncGenerator<Media[]> {
  let batch: Media[] = [], bytes = 0;
  while (offset < photos.length) {
    const video = photos[offset].mime_type === 'video/mp4';
    if (video) {
      if (batch.length) { yield batch; batch = []; bytes = 0; }
      requireTelegramTime(deadline, TELEGRAM_MEDIA_TIMEOUT_MS + 45_000);
      yield [await loadMedia(photos[offset])];
      offset += 1;
      continue;
    }
    if (batch.length === 10) { yield batch; batch = []; bytes = 0; }
    const chunk: Attachment[] = [];
    for (let i = offset; i < photos.length && chunk.length < Math.min(3, 10 - batch.length) && photos[i].mime_type !== 'video/mp4'; i++) chunk.push(photos[i]);
    requireTelegramTime(deadline, TELEGRAM_MEDIA_TIMEOUT_MS + (chunk.some(photo => photo.cloudinary_public_id) ? 5_000 : 15_000));
    for (const file of await Promise.all(chunk.map(loadMedia))) {
      if (batch.length && bytes + mediaBytes(file) > TELEGRAM_ALBUM_BYTES) { yield batch; batch = []; bytes = 0; }
      batch.push(file); bytes += mediaBytes(file);
      if (batch.length === 10) { yield batch; batch = []; bytes = 0; }
    }
    offset += chunk.length;
  }
  if (batch.length) yield batch;
}
