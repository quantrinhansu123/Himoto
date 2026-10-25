import 'server-only';
import type { PoolClient } from 'pg';
import { RecordPhotoError } from './record-photos';

// The caller owns the transaction. Both the order and source photos are read
// through branch RLS. Copies retain their own references when the customer
// profile is changed later; importing again only fills missing slots.
export async function copyContractCustomerPhotos(db:Pick<PoolClient,'query'>,id:number,actor:number) {
  const order=(await db.query('SELECT customer_id FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0];
  if(!order)throw new RecordPhotoError('Không tìm thấy hợp đồng.',404);
  if(!order.customer_id)return {copied:0};
  const result=await db.query(`INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by,cloudinary_public_id,cloudinary_cloud_name,cloudinary_version)
    SELECT 'contracts',$1,CASE WHEN slot ~ '^id_front' THEN replace(slot,'id_front','customer-id-front') WHEN slot ~ '^id_back' THEN replace(slot,'id_back','customer-id-back') ELSE replace(slot,'driver_license','customer-driver-license') END,
      mime_type,data,$3,cloudinary_public_id,cloudinary_cloud_name,cloudinary_version
    FROM himoto.management_record_photos WHERE entity_type='customers' AND entity_id=$2 AND slot ~ '^(id_front|id_back|driver_license)(-extra-[1-9][0-9]{0,14})?$'
    ON CONFLICT(entity_type,entity_id,slot) DO NOTHING`,[id,order.customer_id,actor]);
  return {copied:result.rowCount||0};
}
