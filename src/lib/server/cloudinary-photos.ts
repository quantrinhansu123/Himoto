import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { RecordPhotoError } from './record-photos';
import type { PoolClient } from 'pg';
import type { PhotoEntity } from '@/lib/management/record-photos';
import { MAX_VIDEO_BYTES } from '@/lib/management/record-photos';
import { cloudflyVideosEnabled, storeConvertedVideo, hasConvertedVideo } from './cloudfly-videos';
import { ownerDatabase } from './himoto-database';

export interface CloudPhotoReceipt { public_id: string; version: number; signature: string; resource_type?: 'video' }
function config() {
  let fromUrl: URL | undefined;
  if (process.env.CLOUDINARY_URL) { try { fromUrl = new URL(process.env.CLOUDINARY_URL); } catch { throw new RecordPhotoError('Cấu hình Cloudinary chưa hợp lệ.', 503); } }
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME || fromUrl?.hostname;
  const api_key = process.env.CLOUDINARY_API_KEY || (fromUrl && decodeURIComponent(fromUrl.username));
  const api_secret = process.env.CLOUDINARY_API_SECRET || (fromUrl && decodeURIComponent(fromUrl.password));
  if (!cloud_name || !/^[a-z0-9_-]+$/i.test(cloud_name) || !api_key || !api_secret) throw new RecordPhotoError('Chưa cấu hình Cloudinary. Ảnh vẫn được giữ trong form; thêm cấu hình rồi thử tải lại.', 503);
  return { cloud_name, api_key, api_secret };
}
export function signPhotoUpload(actorId: number, uploadId: unknown, now = Date.now(), video = false) {
  if (typeof uploadId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uploadId)) throw new RecordPhotoError('Mã tải ảnh không hợp lệ.');
  const settings = config();
  const params = { public_id: `himoto/${video?'management-video':'management'}/${actorId}/${uploadId}`, timestamp: Math.floor(now / 1000), type: 'authenticated', overwrite: false, format: video?'mp4':'jpg', allowed_formats: video?'mp4,mov,webm':'jpg,png,webp', ...(video?{transformation:'c_limit,w_1280,h_1280,vc_h264,ac_aac'}:{}) };
  return { cloud_name: settings.cloud_name, api_key: settings.api_key, params, signature: cloudinary.utils.api_sign_request(params, settings.api_secret) };
}
export function verifyPhotoReceipt(value: unknown, actorId: number): CloudPhotoReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RecordPhotoError('Thông tin ảnh Cloudinary không hợp lệ.');
  const input = value as Record<string, unknown>;
  const video=input.resource_type==='video';
  if (Object.keys(input).some(key => !['public_id', 'version', 'signature', 'resource_type'].includes(key)) || input.resource_type!==undefined&&!video || typeof input.public_id !== 'string' || !new RegExp(`^himoto/${video?'management-video':'management'}/${actorId}/[0-9a-f-]{36}$`, 'i').test(input.public_id) || !Number.isSafeInteger(input.version) || Number(input.version) <= 0 || typeof input.signature !== 'string' || !/^[a-f0-9]{40}$/i.test(input.signature)) throw new RecordPhotoError('Thông tin ảnh Cloudinary không hợp lệ.');
  const expected = cloudinary.utils.api_sign_request({ public_id: input.public_id, version: input.version }, config().api_secret);
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature.toLowerCase()))) throw new RecordPhotoError('Chữ ký ảnh Cloudinary không hợp lệ.');
  return { public_id: input.public_id, version: Number(input.version), signature: input.signature, ...(video?{resource_type:'video' as const}:{}) };
}
export async function writeCloudinaryPhoto(client: Pick<PoolClient, 'query'>, entity: PhotoEntity, id: number, slot: string, actor: number, receipt: CloudPhotoReceipt) {
  const video=receipt.resource_type==='video';
  if(video) {
    if(entity!=='contracts'||!/-video-[1-3]$/.test(slot))throw new RecordPhotoError('Video chỉ lưu ở ô video hợp đồng.');
    if (cloudflyVideosEnabled()) {
      const stored = await cloudinaryVideoObject(receipt, 60);
      await client.query(`INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by,object_bucket,object_key,object_etag)
        VALUES($1,$2,$3,'video/mp4',NULL,$4,$5,$6,$7) ON CONFLICT(entity_type,entity_id,slot)
        DO UPDATE SET mime_type='video/mp4',data=NULL,updated_by=EXCLUDED.updated_by,updated_at=now(),
          cloudinary_public_id=NULL,cloudinary_cloud_name=NULL,cloudinary_version=NULL,
          object_bucket=EXCLUDED.object_bucket,object_key=EXCLUDED.object_key,object_etag=EXCLUDED.object_etag`,
      [entity,id,slot,actor,stored.object_bucket,stored.object_key,stored.object_etag]);
      return stored;
    }
    const asset=await cloudinary.api.resource(receipt.public_id,{...config(),resource_type:'video',type:'authenticated',media_metadata:true});
    if(asset.resource_type!=='video'||asset.format!=='mp4'||Number(asset.version)!==receipt.version||!asset.bytes||asset.bytes>MAX_VIDEO_BYTES||!asset.duration||asset.duration>60)throw new RecordPhotoError('Video cần là MP4 tối đa 45 MB và 60 giây.');
  } else if(/-video-[1-3]$/.test(slot))throw new RecordPhotoError('Chọn video cho ô này.');
  await client.query(`INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by,cloudinary_public_id,cloudinary_cloud_name,cloudinary_version)
    VALUES($1,$2,$3,$8,NULL,$4,$5,$6,$7) ON CONFLICT(entity_type,entity_id,slot)
    DO UPDATE SET mime_type=EXCLUDED.mime_type,data=NULL,updated_by=EXCLUDED.updated_by,updated_at=now(),cloudinary_public_id=EXCLUDED.cloudinary_public_id,cloudinary_cloud_name=EXCLUDED.cloudinary_cloud_name,cloudinary_version=EXCLUDED.cloudinary_version,object_bucket=NULL,object_key=NULL,object_etag=NULL`,
  [entity, id, slot, actor, receipt.public_id, config().cloud_name, receipt.version,video?'video/mp4':'image/jpeg']);
}
type ShiftAssetMetadata={resource_type?:string;format?:string;version?:number;bytes?:number;duration?:number};
export async function shiftCloudAsset(receipt:CloudPhotoReceipt,readAsset:(id:string,options:Record<string,unknown>)=>Promise<ShiftAssetMetadata>=(id,options)=>cloudinary.api.resource(id,options)) {
  const settings=config();
  if(receipt.resource_type==='video') {
    if (cloudflyVideosEnabled()) return { cloud_name: settings.cloud_name, mime_type: 'video/mp4', ...await cloudinaryVideoObject(receipt, 180) };
    const asset=await readAsset(receipt.public_id,{...settings,resource_type:'video',type:'authenticated',media_metadata:true,timeout:15000});
    if(asset.resource_type!=='video'||asset.format!=='mp4'||Number(asset.version)!==receipt.version||!asset.bytes||asset.bytes>MAX_VIDEO_BYTES||!asset.duration||asset.duration>180)throw new RecordPhotoError('Video kiểm kê tối đa 45 MB và 3 phút.');
  }
  return {cloud_name:settings.cloud_name,mime_type:receipt.resource_type==='video'?'video/mp4':'image/jpeg'};
}
export async function cloudinaryVideoObject(receipt: CloudPhotoReceipt, maxDuration: number) {
  const settings = config();
  return storeConvertedVideo(receipt, settings.cloud_name, maxDuration,
    () => cloudinary.api.resource(receipt.public_id, { ...settings, resource_type: 'video', type: 'authenticated', media_metadata: true, timeout: 15000 }),
    () => readCloudinaryPhoto({ cloudinary_public_id: receipt.public_id, cloudinary_cloud_name: settings.cloud_name, cloudinary_version: receipt.version, mime_type: 'video/mp4' }));
}
/** Never delete the conversion before COMMIT or while any legacy record/queue still needs it. */
export async function cleanupConvertedVideo(receipt: CloudPhotoReceipt) {
  if (receipt.resource_type !== 'video' || !cloudflyVideosEnabled()) return;
  try {
    const settings = config();
    if (!await hasConvertedVideo(receipt, settings.cloud_name)) return;
    const refs = await ownerDatabase.query(`SELECT (
      EXISTS(SELECT 1 FROM himoto.management_record_photos WHERE cloudinary_public_id=$1 AND cloudinary_cloud_name=$2)
      OR EXISTS(SELECT 1 FROM himoto.management_shift_media WHERE cloudinary_public_id=$1 AND cloudinary_cloud_name=$2)
      OR EXISTS(SELECT 1 FROM himoto.management_contract_notifications n,
        LATERAL jsonb_array_elements(COALESCE(n.payload::jsonb->'photos','[]'::jsonb)) p
        WHERE p->>'cloudinary_public_id'=$1 AND p->>'cloudinary_cloud_name'=$2)
    ) AS referenced`, [receipt.public_id, settings.cloud_name]);
    if (refs.rows[0]?.referenced !== false) return;
    const options = { ...settings, resource_type: 'video' as const, type: 'authenticated' as const, invalidate: true, timeout: 15000 };
    await cloudinary.uploader.destroy(receipt.public_id, options);
  } catch {
    // The durable copy is already committed. Cleanup failure must not turn a saved file into an error.
    console.error('Temporary video conversion cleanup pending.');
  }
}
export async function readCloudinaryPhoto(photo: { cloudinary_public_id: string; cloudinary_cloud_name: string; cloudinary_version: number; mime_type?: string }, range?:string|null) {
  const settings = config();
  if (settings.cloud_name !== photo.cloudinary_cloud_name) throw new RecordPhotoError('Cấu hình Cloudinary không khớp nơi lưu ảnh.', 503);
  const video=photo.mime_type==='video/mp4';
  const url = cloudinary.utils.private_download_url(photo.cloudinary_public_id, video?'mp4':'jpg', { ...settings, resource_type:video?'video':'image', type: 'authenticated', expires_at: Math.floor(Date.now() / 1000) + 300 });
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(video?45_000:15_000), ...(range?{headers:{Range:range}}:{}) });
  if (!response.ok) throw new RecordPhotoError('Không tải được ảnh Cloudinary. Thử lại sau.', 502);
  return response;
}
