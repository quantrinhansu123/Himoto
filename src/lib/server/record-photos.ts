import 'server-only';
import type { PoolClient } from 'pg';
import { hasRenewalVersion, nextRenewalVersion } from '@/lib/management/contract-renewals';
import { isVehicleDocumentSlot, MAX_PHOTO_BYTES, type PhotoEntity } from '@/lib/management/record-photos';
import { isContractTransactionPhoto } from '@/lib/management/contract-photos';

export class RecordPhotoError extends Error { constructor(message: string, public status = 400) { super(message); } }
const isVehicleTransferPhoto = (slot: string) => /^(transfer|receive)-[1-9]\d{0,14}-1$/.test(slot);
export function parsePhotoTarget(entity: string, id: string, slot?: string): { entity: PhotoEntity; id: number; slot?: string } {
  if (!['customers', 'contracts', 'vehicles'].includes(entity) || !/^[1-9]\d{0,14}$/.test(id) || !Number.isSafeInteger(Number(id))) throw new RecordPhotoError('Hồ sơ không hợp lệ.');
  if (slot !== undefined && !(entity === 'customers' ? ['id_front', 'id_back', 'driver_license'].includes(slot)
    : entity === 'vehicles' ? isVehicleTransferPhoto(slot) || isVehicleDocumentSlot(slot)
    : /^plate-[1-9]\d{0,14}$/.test(slot) || isContractTransactionPhoto(slot))) throw new RecordPhotoError('Loại ảnh không hợp lệ.');
  return { entity: entity as PhotoEntity, id: Number(id), slot };
}
export function validatePhotoBytes(type: string, data: Buffer) {
  if (!data.length || data.length > MAX_PHOTO_BYTES) throw new RecordPhotoError('Mỗi ảnh tối đa 2 MB.', 413);
  const jpeg = type === 'image/jpeg' && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const png = type === 'image/png' && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = type === 'image/webp' && data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP';
  if (!jpeg && !png && !webp) throw new RecordPhotoError('Chỉ nhận ảnh JPEG, PNG hoặc WebP hợp lệ.');
}
export async function requirePhotoRecord(client: Pick<PoolClient, 'query'>, entity: PhotoEntity, id: number, lock = true) {
  if (entity === 'vehicles') {
    // Source-store staff lose vehicles RLS after current_store_id moves. The
    // request already pins operation=transfer + transfer_vehicle_id before SET
    // ROLE; keep a same-transaction pin too, then fall back to the event the
    // sending/receiving store can still see.
    await client.query(
      `SELECT set_config('himoto.transfer_vehicle_id',$1,true),
              set_config('himoto.operation','transfer',true)`,
      [String(id)],
    );
    const vehicle = await client.query('SELECT id FROM himoto.vehicles WHERE id=$1::bigint', [id]);
    if (vehicle.rowCount) return;
    const event = await client.query(
      `SELECT vehicle_id FROM himoto.vehicle_location_events
       WHERE vehicle_id=$1 AND event_type IN ('manual_transfer','manual_transfer_receive')
       LIMIT 1`,
      [id],
    );
    if (!event.rowCount) throw new RecordPhotoError('Không tìm thấy hồ sơ.', 404);
    return;
  }
  const table = entity === 'customers' ? 'customers' : 'orders';
  // Row locks also require UPDATE visibility. Linked customers can be read
  // across branches, while their original profile remains owned by its store.
  const result = await client.query(`SELECT id FROM himoto.${table} WHERE id=$1${entity === 'contracts' ? ' AND deleted_at IS NULL' : ''}${lock ? ' FOR SHARE' : ''}`, [id]);
  if (!result.rowCount) throw new RecordPhotoError('Không tìm thấy hồ sơ.', 404);
}
export async function requireContractPhotoSlot(client:Pick<PoolClient,'query'>,entity:PhotoEntity,id:number,slot:string) {
  const transfer=entity==='vehicles'?slot.match(/^(transfer|receive)-([1-9]\d*)-1$/):null;
  if(transfer) {
    const type=transfer[1]==='receive'?'manual_transfer_receive':'manual_transfer';
    if(!(await client.query('SELECT id FROM himoto.vehicle_location_events WHERE id=$1 AND vehicle_id=$2 AND event_type=$3',[Number(transfer[2]),id,type])).rowCount)
      throw new RecordPhotoError('Ảnh không thuộc lượt chuyển/nhận xe này.',404);
  }
  const swap=entity==='contracts'?slot.match(/^battery-swap-([1-9]\d*)-/):null;
  if(swap&&!(await client.query('SELECT id FROM himoto.management_contract_battery_swaps WHERE id=$1 AND order_id=$2',[Number(swap[1]),id])).rowCount)throw new RecordPhotoError('Lượt đổi pin không thuộc hợp đồng.',404);
  const vehicleSwap=entity==='contracts'?slot.match(/^vehicle-swap-([1-9]\d*)-1$/):null;
  if(vehicleSwap&&!(await client.query('SELECT id FROM himoto.management_contract_vehicle_swaps WHERE id=$1 AND order_id=$2',[Number(vehicleSwap[1]),id])).rowCount)throw new RecordPhotoError('Lượt đổi xe không thuộc hợp đồng.',404);
  const item=entity==='contracts'?slot.match(/^return-([1-9]\d*)-(?:[1-9]\d{0,14}|video-[1-3]|document-[1-9]\d{0,14})$/):null;
  if(item&&!(await client.query('SELECT id FROM himoto.order_vehicle_details WHERE id=$1 AND order_id=$2 AND deleted_at IS NULL',[Number(item[1]),id])).rowCount)throw new RecordPhotoError('Xe trả không thuộc hợp đồng.',404);
  const renewal=entity==='contracts'?slot.match(/^renewal-([1-9]\d*)-(?:[1-9]\d{0,14}|video-[1-3]|document-[1-9]\d{0,14})$/):null;
  if(renewal) {
    const row=(await client.query('SELECT draft_payload,order_status FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL',[id])).rows[0];
    if(!row)throw new RecordPhotoError('Lần gia hạn không thuộc hợp đồng.',404);
    const versions=row.draft_payload?.management_composer?.versions;
    const version=Number(renewal[1]);
    // Allow the next renewal slot on any issued contract so biên nhận can be saved before "Lưu gia hạn".
    const open=!['draft','cancelled'].includes(String(row.order_status||''));
    if(!hasRenewalVersion(versions,version)&&!(version===nextRenewalVersion(versions)&&open))throw new RecordPhotoError('Lần gia hạn không thuộc hợp đồng.',404);
  }
  const receipt=entity==='contracts'?slot.match(/^renewal-receipt-([1-9]\d*)-(?:[1-9]\d{0,14}|video-[1-3]|document-[1-9]\d{0,14})$/):null;
  if(receipt&&!(await client.query('SELECT transaction_id FROM himoto.management_contract_payments WHERE transaction_id=$1 AND order_id=$2 AND renewal_payload IS NOT NULL',[Number(receipt[1]),id])).rowCount)throw new RecordPhotoError('Phiếu gia hạn không thuộc hợp đồng.',404);
}
export async function readRecordPhotos(client: Pick<PoolClient, 'query'>, entity: PhotoEntity, id: number) {
  await requirePhotoRecord(client, entity, id, false);
  const result = await client.query('SELECT slot, updated_at, mime_type FROM himoto.management_record_photos WHERE entity_type=$1 AND entity_id=$2 ORDER BY slot', [entity, id]);
  return result.rows;
}
export async function deleteRecordPhoto(client: Pick<PoolClient, 'query'>, entity: PhotoEntity, id: number, slot: string) {
  await requirePhotoRecord(client, entity, id);
  const result = await client.query('DELETE FROM himoto.management_record_photos WHERE entity_type=$1 AND entity_id=$2 AND slot=$3 RETURNING slot', [entity, id, slot]);
  if (!result.rowCount) throw new RecordPhotoError('Chưa có ảnh.', 404);
}
export async function writeRecordPhoto(client: Pick<PoolClient, 'query'>, entity: PhotoEntity, id: number, slot: string, type: string, data: Buffer, actorId: number) {
  if(/-video-[1-3]$/.test(slot))throw new RecordPhotoError('Video cần tải qua Cloudinary.');
  validatePhotoBytes(type, data);
  await requirePhotoRecord(client, entity, id);
  await client.query(`INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(entity_type,entity_id,slot)
    DO UPDATE SET mime_type=EXCLUDED.mime_type,data=EXCLUDED.data,updated_by=EXCLUDED.updated_by,updated_at=now(),cloudinary_public_id=NULL,cloudinary_cloud_name=NULL,cloudinary_version=NULL,object_bucket=NULL,object_key=NULL,object_etag=NULL`, [entity, id, slot, type, data, actorId]);
}
