import 'server-only';
import type { PoolClient } from 'pg';
import { MAX_PHOTO_BYTES, type PhotoEntity } from '@/lib/management/record-photos';

export class RecordPhotoError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function parsePhotoTarget(entity: string, id: string, slot?: string): { entity: PhotoEntity; id: number; slot?: string } {
  if (!['customers', 'contracts'].includes(entity) || !/^[1-9]\d{0,14}$/.test(id) || !Number.isSafeInteger(Number(id))) throw new RecordPhotoError('Hồ sơ không hợp lệ.');
  if (slot !== undefined && !(entity === 'customers' ? ['id_front', 'id_back'].includes(slot) : /^plate-[1-9]\d{0,14}$/.test(slot))) throw new RecordPhotoError('Loại ảnh không hợp lệ.');
  return { entity: entity as PhotoEntity, id: Number(id), slot };
}
export function validatePhotoBytes(type: string, data: Buffer) {
  if (!data.length || data.length > MAX_PHOTO_BYTES) throw new RecordPhotoError('Mỗi ảnh tối đa 2 MB.', 413);
  const jpeg = type === 'image/jpeg' && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const png = type === 'image/png' && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = type === 'image/webp' && data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP';
  if (!jpeg && !png && !webp) throw new RecordPhotoError('Chỉ nhận ảnh JPEG, PNG hoặc WebP hợp lệ.');
}
export async function requirePhotoRecord(client: Pick<PoolClient, 'query'>, entity: PhotoEntity, id: number) {
  const table = entity === 'customers' ? 'customers' : 'orders';
  const result = await client.query(`SELECT id FROM himoto.${table} WHERE id=$1${entity === 'contracts' ? ' AND deleted_at IS NULL' : ''} FOR SHARE`, [id]);
  if (!result.rowCount) throw new RecordPhotoError('Không tìm thấy hồ sơ.', 404);
}
export async function readRecordPhotos(client: Pick<PoolClient, 'query'>, entity: PhotoEntity, id: number) {
  await requirePhotoRecord(client, entity, id);
  const result = await client.query('SELECT slot, updated_at FROM himoto.management_record_photos WHERE entity_type=$1 AND entity_id=$2 ORDER BY slot', [entity, id]);
  return result.rows;
}
export async function writeRecordPhoto(client: Pick<PoolClient, 'query'>, entity: PhotoEntity, id: number, slot: string, type: string, data: Buffer, actorId: number) {
  validatePhotoBytes(type, data);
  await requirePhotoRecord(client, entity, id);
  await client.query(`INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(entity_type,entity_id,slot)
    DO UPDATE SET mime_type=EXCLUDED.mime_type,data=EXCLUDED.data,updated_by=EXCLUDED.updated_by,updated_at=now()`, [entity, id, slot, type, data, actorId]);
}
