import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { RecordPhotoError } from './record-photos';
import type { PoolClient } from 'pg';
import type { PhotoEntity } from '@/lib/management/record-photos';

export interface CloudPhotoReceipt { public_id: string; version: number; signature: string }
function config() {
  let fromUrl: URL | undefined;
  if (process.env.CLOUDINARY_URL) { try { fromUrl = new URL(process.env.CLOUDINARY_URL); } catch { throw new RecordPhotoError('Cấu hình Cloudinary chưa hợp lệ.', 503); } }
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME || fromUrl?.hostname;
  const api_key = process.env.CLOUDINARY_API_KEY || (fromUrl && decodeURIComponent(fromUrl.username));
  const api_secret = process.env.CLOUDINARY_API_SECRET || (fromUrl && decodeURIComponent(fromUrl.password));
  if (!cloud_name || !/^[a-z0-9_-]+$/i.test(cloud_name) || !api_key || !api_secret) throw new RecordPhotoError('Chưa cấu hình Cloudinary. Ảnh vẫn được giữ trong form; thêm cấu hình rồi thử tải lại.', 503);
  return { cloud_name, api_key, api_secret };
}
export function signPhotoUpload(actorId: number, uploadId: unknown, now = Date.now()) {
  if (typeof uploadId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uploadId)) throw new RecordPhotoError('Mã tải ảnh không hợp lệ.');
  const settings = config();
  const params = { public_id: `himoto/management/${actorId}/${uploadId}`, timestamp: Math.floor(now / 1000), type: 'authenticated', overwrite: false, format: 'jpg', allowed_formats: 'jpg,png,webp' };
  return { cloud_name: settings.cloud_name, api_key: settings.api_key, params, signature: cloudinary.utils.api_sign_request(params, settings.api_secret) };
}
export function verifyPhotoReceipt(value: unknown, actorId: number): CloudPhotoReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RecordPhotoError('Thông tin ảnh Cloudinary không hợp lệ.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !['public_id', 'version', 'signature'].includes(key)) || typeof input.public_id !== 'string' || !new RegExp(`^himoto/management/${actorId}/[0-9a-f-]{36}$`, 'i').test(input.public_id) || !Number.isSafeInteger(input.version) || Number(input.version) <= 0 || typeof input.signature !== 'string' || !/^[a-f0-9]{40}$/i.test(input.signature)) throw new RecordPhotoError('Thông tin ảnh Cloudinary không hợp lệ.');
  const expected = cloudinary.utils.api_sign_request({ public_id: input.public_id, version: input.version }, config().api_secret);
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature.toLowerCase()))) throw new RecordPhotoError('Chữ ký ảnh Cloudinary không hợp lệ.');
  return { public_id: input.public_id, version: Number(input.version), signature: input.signature };
}
export async function writeCloudinaryPhoto(client: Pick<PoolClient, 'query'>, entity: PhotoEntity, id: number, slot: string, actor: number, receipt: CloudPhotoReceipt) {
  await client.query(`INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by,cloudinary_public_id,cloudinary_cloud_name,cloudinary_version)
    VALUES($1,$2,$3,'image/jpeg',NULL,$4,$5,$6,$7) ON CONFLICT(entity_type,entity_id,slot)
    DO UPDATE SET mime_type=EXCLUDED.mime_type,data=NULL,updated_by=EXCLUDED.updated_by,updated_at=now(),cloudinary_public_id=EXCLUDED.cloudinary_public_id,cloudinary_cloud_name=EXCLUDED.cloudinary_cloud_name,cloudinary_version=EXCLUDED.cloudinary_version`,
  [entity, id, slot, actor, receipt.public_id, config().cloud_name, receipt.version]);
}
export async function readCloudinaryPhoto(photo: { cloudinary_public_id: string; cloudinary_cloud_name: string; cloudinary_version: number }) {
  const settings = config();
  if (settings.cloud_name !== photo.cloudinary_cloud_name) throw new RecordPhotoError('Cấu hình Cloudinary không khớp nơi lưu ảnh.', 503);
  const url = cloudinary.utils.private_download_url(photo.cloudinary_public_id, 'jpg', { ...settings, type: 'authenticated', expires_at: Math.floor(Date.now() / 1000) + 60 });
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new RecordPhotoError('Không tải được ảnh Cloudinary. Thử lại sau.', 502);
  return response;
}
