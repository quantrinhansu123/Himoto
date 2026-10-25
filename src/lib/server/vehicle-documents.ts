import 'server-only';
import type { PoolClient } from 'pg';
import { isVehicleDocumentSlot, VEHICLE_DOCUMENT_SLOTS, type VehicleDocumentSlot } from '@/lib/management/record-photos';
import { RecordPhotoError } from './record-photos';
import { verifyPhotoReceipt, writeCloudinaryPhoto, type CloudPhotoReceipt } from './cloudinary-photos';
import { photoBaseSlot } from '@/lib/management/photo-slot-groups';

export type VehicleDocuments = Partial<Record<VehicleDocumentSlot, CloudPhotoReceipt | null>>;
export function parseVehicleDocuments(value: unknown, actor: number): VehicleDocuments {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RecordPhotoError('Giấy tờ xe không hợp lệ.');
  return Object.fromEntries(Object.entries(value).map(([slot, photo]) => {
    if (!isVehicleDocumentSlot(slot)) throw new RecordPhotoError('Loại giấy tờ xe không hợp lệ.');
    const receipt = photo === null ? null : verifyPhotoReceipt(photo, actor);
    if (receipt?.resource_type) throw new RecordPhotoError('Giấy tờ xe chỉ nhận ảnh.');
    return [slot, receipt];
  }));
}
// Called inside the vehicle transaction: failed attachments roll back the vehicle too.
export async function writeVehicleDocuments(db: Pick<PoolClient, 'query'>, id: number, documents: VehicleDocuments, actor: number) {
  for (const [slot, receipt] of Object.entries(documents)) {
    if (receipt) await writeCloudinaryPhoto(db, 'vehicles', id, slot, actor, receipt);
    else await db.query("DELETE FROM himoto.management_record_photos WHERE entity_type='vehicles' AND entity_id=$1 AND slot=$2", [id, slot]);
  }
}
export function vehicleDocumentNote(documents: VehicleDocuments) {
  return Object.entries(documents).map(([key,receipt])=>`${receipt?'Lưu':'Bỏ'} ảnh ${VEHICLE_DOCUMENT_SLOTS.find(slot=>slot.key===photoBaseSlot(key))?.label.toLowerCase()||key}`).join('; ');
}
