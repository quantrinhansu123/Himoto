import 'server-only';
import { VEHICLE_ORDER_SQL } from './contract-classification';
import type { PoolClient } from 'pg';
import { VEHICLE_STATUSES, VEHICLE_TYPES } from '@/lib/management/config';
import { vehicleRevision, writeVehicleAudit } from './vehicle-audit';

type Client = Pick<PoolClient, 'query'>;
export class VehicleSaveError extends Error { constructor(message: string, public status = 400) { super(message); } }
export interface VehicleValues { name: string; license: string; brand: string; type: string; year: number; store_id: number; status: string; color: string; chassis: string; engine: string; odometer: number | null; note: string; revision?: string }

const text = (value: unknown, label: string, max: number, required = false) => {
  const result = typeof value === 'string' ? value.trim() : value == null ? '' : null;
  if (result === null || result.length > max) throw new VehicleSaveError(`${label} không hợp lệ (tối đa ${max} ký tự).`);
  if (required && !result) throw new VehicleSaveError(`Vui lòng nhập ${label.toLowerCase()}.`);
  return result;
};
const integer = (value: unknown) => value == null || value === '' ? null : Number.isSafeInteger(Number(value)) ? Number(value) : NaN;

export function parseVehicleValues(body: unknown): VehicleValues {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new VehicleSaveError('Thông tin xe không hợp lệ.');
  const raw = body as Record<string, unknown>;
  let revision: string | undefined;
  try { revision=vehicleRevision(raw.revision); } catch { throw new VehicleSaveError('Phiên bản thông tin xe không hợp lệ.'); }
  const type = String(raw.type || ''), status = String(raw.status || '');
  if (!VEHICLE_TYPES.some(option => option.value === type)) throw new VehicleSaveError('Chọn loại xe hợp lệ.');
  if (!VEHICLE_STATUSES.some(option => option.value === status)) throw new VehicleSaveError('Chọn trạng thái xe hợp lệ.');
  const year = integer(raw.year), storeId = integer(raw.store_id), odometer = integer(raw.odometer);
  if (year === null || Number.isNaN(year) || year < 1980 || year > new Date().getFullYear() + 1) throw new VehicleSaveError('Năm sản xuất không hợp lệ.');
  if (storeId === null || Number.isNaN(storeId) || storeId <= 0) throw new VehicleSaveError('Chọn cơ sở cho xe.');
  if (Number.isNaN(odometer) || (odometer !== null && odometer < 0)) throw new VehicleSaveError('Số km phải là số nguyên không âm.');
  return { name: text(raw.name, 'Tên xe', 255, true), license: text(raw.license, 'Biển số', 25, true).toUpperCase(), brand: text(raw.brand, 'Hãng xe', 255, true),
    type, year, store_id: storeId, status, color: text(raw.color, 'Màu sắc', 255), chassis: text(raw.chassis, 'Số khung', 255), engine: text(raw.engine, 'Số máy', 255), odometer, note: text(raw.note, 'Ghi chú', 500), ...(revision?{revision}:{}) };
}

// Inventory may record a checkout before the source branch enters the contract.
// An actual open contract still owns vehicle status and prevents branch changes.
async function checkVehicle(client: Client, values: VehicleValues, id: number | null, currentStoreId?: unknown, currentStatus?: string) {
  if (id !== null) {
    if(currentStatus==='in_transit'&&(values.status!=='in_transit'||String(values.store_id)!==String(currentStoreId)))throw new VehicleSaveError('Xe đang Chờ luân chuyển. Dùng Xác nhận nhận xe tại cơ sở đích trước khi đổi trạng thái hoặc cơ sở.',409);
    const open = await client.query(`SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
      WHERE d.vehicle_id=$1 AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
        AND o.order_status IN ('renting','overdue','wait_payment','pending','deposit_contract') LIMIT 1`, [id]);
    if (open.rowCount && values.status !== (currentStatus === 'rent' ? 'using' : currentStatus)) throw new VehicleSaveError('Xe đang thuộc hợp đồng mở. Trả xe trên hợp đồng để đổi trạng thái.');
    if (open.rowCount && String(values.store_id) !== String(currentStoreId)) throw new VehicleSaveError('Xe đang thuộc hợp đồng mở, không được đổi cơ sở quản lý xe.');
  }
  const store = await client.query('SELECT 1 FROM himoto.stores WHERE id=$1 FOR SHARE', [values.store_id]);
  if (!store.rowCount) throw new VehicleSaveError('Cơ sở đã chọn không còn tồn tại.');
  const duplicate = await client.query('SELECT id FROM himoto.vehicles WHERE upper(btrim(license))=$1 AND ($2::bigint IS NULL OR id<>$2) LIMIT 1', [values.license, id]);
  if (duplicate.rowCount) throw new VehicleSaveError(`Biển số ${values.license} đã có trong danh sách xe.`, 409);
}

export async function createDatabaseVehicle(client: Client, values: VehicleValues, actorId: number) {
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query('LOCK TABLE himoto.vehicles IN SHARE ROW EXCLUSIVE MODE');
  await checkVehicle(client, values, null);
  const result = await client.query(`INSERT INTO himoto.vehicles (name, brand, type, year, store_id, current_store_id, license, color, chassis, engine, status, odometer, type_of_service_id, created_by, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$5,$6,NULLIF($7,''),NULLIF($8,''),NULLIF($9,''),$10,$11,0,$12,now(),now()) RETURNING id`,
    [values.name, values.brand, values.type, values.year, values.store_id, values.license, values.color, values.chassis, values.engine, values.status, values.odometer, actorId]);
  const id = Number(result.rows[0].id);
  if (values.note) await writeVehicleAudit(client, {vehicleId:id,before:{...values},after:{...values},type:'note',note:values.note,actorId});
  return { id };
}

// Cơ sở on the list is where the vehicle is now (current_store_id); the original store_id is kept.
export async function updateDatabaseVehicle(client: Client, id: number, values: VehicleValues, actorId: number) {
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query('LOCK TABLE himoto.vehicles IN SHARE ROW EXCLUSIVE MODE');
  const current = await client.query('SELECT v.*, COALESCE(v.current_store_id,v.store_id) AS store_id,v.xmin::text AS revision FROM himoto.vehicles v WHERE v.id=$1 FOR UPDATE', [id]);
  if (!current.rowCount) throw new VehicleSaveError('Không tìm thấy xe. Nhấn Làm mới để kiểm tra.', 404);
  if(values.revision&&values.revision!==current.rows[0].revision)throw new VehicleSaveError('Thông tin xe đã thay đổi. Nhấn Làm mới rồi mở lại form chỉnh sửa.',409);
  await checkVehicle(client, values, id, current.rows[0].store_id, String(current.rows[0].status));
  await client.query(`UPDATE himoto.vehicles SET name=$2, brand=$3, type=$4, year=$5, current_store_id=$6, license=$7, color=NULLIF($8,''), chassis=NULLIF($9,''),
    engine=NULLIF($10,''), status=$11, odometer=$12, updated_at=now() WHERE id=$1`,
    [id, values.name, values.brand, values.type, values.year, values.store_id, values.license, values.color, values.chassis, values.engine, values.status, values.odometer]);
  const before=current.rows[0],statusChanged=String(before.status)!==values.status;
  await writeVehicleAudit(client,{vehicleId:id,before,after:{...before,...values},actorId,note:values.note,
    type:statusChanged?'status_change':'vehicle_edit',refType:statusChanged?values.status:null});
  return { id };
}
