import 'server-only';
import type { PoolClient } from 'pg';
import { VEHICLE_STATUSES } from '@/lib/management/config';
import { createContractDraft, customerDetails, vehicleDetails } from '@/lib/management/contract-document';
import type { ManagementRow } from '@/lib/management/types';
import { saveDatabaseDraft } from './contract-drafts';

type Client = Pick<PoolClient, 'query'>;
export interface VehicleActionCustomer { id: number; name: string; created: boolean; matched_by: string }
export interface VehicleActionResult { id: number; event_id: number; customer?: VehicleActionCustomer; draft?: { id: number; code: string } }
export class VehicleActionError extends Error { constructor(message: string, public status = 400) { super(message); } }
export type VehicleActionInput =
  | { action: 'transfer'; to_store_id: number; note: string }
  | { action: 'status'; status: 'ready' | 'using'; beneficiary_store_id: number; customer_name: string; customer_phone: string; customer_id_card: string; note: string };

const text = (value: unknown, label: string, max: number) => {
  const result = typeof value === 'string' ? value.trim() : value == null ? '' : null;
  if (result === null || result.length > max) throw new VehicleActionError(`${label} không hợp lệ (tối đa ${max} ký tự).`);
  return result;
};
const storeId = (value: unknown, label: string) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new VehicleActionError(`Chọn ${label}.`);
  return id;
};
const statusLabel = (value: string) => VEHICLE_STATUSES.find(option => option.value === value)?.label || value;

export function parseVehicleAction(body: unknown): VehicleActionInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new VehicleActionError('Thông tin thao tác không hợp lệ.');
  const raw = body as Record<string, unknown>;
  const note = text(raw.note, 'Ghi chú', 500);
  if (raw.action === 'transfer') return { action: 'transfer', to_store_id: storeId(raw.to_store_id, 'cơ sở chuyển đến'), note };
  if (raw.action !== 'status') throw new VehicleActionError('Thao tác không hợp lệ.');
  if (raw.status !== 'ready' && raw.status !== 'using') throw new VehicleActionError('Chọn trạng thái Đang thuê hoặc Lưu kho.');
  const name = text(raw.customer_name, 'Tên khách', 191), phone = text(raw.customer_phone, 'Số điện thoại', 32).replace(/[\s.-]/g, ''), idCard = text(raw.customer_id_card, 'CCCD', 32).replace(/\s/g, '');
  if (raw.status === 'using' && !name) throw new VehicleActionError('Nhập tên khách thuê xe.');
  if (raw.status === 'using' && !phone) throw new VehicleActionError('Nhập số điện thoại khách.');
  if (raw.status === 'using' && !idCard) throw new VehicleActionError('Nhập CCCD của khách để kiểm tra và tạo hợp đồng nháp.');
  if (phone && !/^\+?\d{8,15}$/.test(phone)) throw new VehicleActionError('Số điện thoại không hợp lệ.');
  if (idCard && !/^\d{9}$|^\d{12}$/.test(idCard)) throw new VehicleActionError('CCCD phải gồm 9 hoặc 12 chữ số.');
  return { action: 'status', status: raw.status, beneficiary_store_id: storeId(raw.beneficiary_store_id, 'cơ sở thụ hưởng'), customer_name: name, customer_phone: phone, customer_id_card: idCard, note };
}

// Phone and CCCD must point at the same profile; a match on either reuses it instead of creating a duplicate.
async function findOrCreateCustomer(client: Client, input: Extract<VehicleActionInput, { action: 'status' }>): Promise<VehicleActionCustomer & { row: ManagementRow }> {
  await client.query('LOCK TABLE himoto.customers IN SHARE ROW EXCLUSIVE MODE');
  const found = await client.query(`SELECT id,name,phone,email,address,id_card,id_card_issued_on,id_card_issued_by,driver_license_number,driver_license_issued_on,status,
      regexp_replace(COALESCE(phone,''),'\\D','','g')=$1 AS phone_match,regexp_replace(COALESCE(id_card,''),'\\s+','','g')=$2 AS id_match
    FROM himoto.customers WHERE regexp_replace(COALESCE(phone,''),'\\D','','g')=$1 OR regexp_replace(COALESCE(id_card,''),'\\s+','','g')=$2
    ORDER BY id LIMIT 5`, [input.customer_phone.replace(/\D/g, ''), input.customer_id_card]);
  if (found.rows.length > 1) throw new VehicleActionError(`SĐT và CCCD đang thuộc các khách hàng khác nhau: ${found.rows.map(row => `${row.name} (#${row.id})`).join(', ')}. Kiểm tra lại danh sách khách hàng.`, 409);
  const existing = found.rows[0];
  if (existing) {
    const idCard = String(existing.id_card || '').replace(/\s+/g, '');
    if (existing.phone_match && idCard && idCard !== input.customer_id_card) throw new VehicleActionError(`SĐT ${input.customer_phone} đã thuộc khách ${existing.name} với CCCD khác (${idCard}).`, 409);
    if (Number(existing.status) === 2) throw new VehicleActionError(`Khách ${existing.name} đang trong Blacklist (nợ xấu). Không tạo hợp đồng.`, 409);
    const matchedBy = existing.phone_match && existing.id_match ? 'SĐT và CCCD' : existing.phone_match ? 'SĐT' : 'CCCD';
    return { id: Number(existing.id), name: String(existing.name), created: false, matched_by: matchedBy, row: { ...existing, id: Number(existing.id) } };
  }
  const inserted = await client.query(`INSERT INTO himoto.customers (name,phone,id_card,status,store_id,relatives,created_at,updated_at)
    VALUES ($1,$2,$3,0,$4,'[]'::jsonb,now(),now()) RETURNING id,name,phone,id_card`, [input.customer_name, input.customer_phone, input.customer_id_card, input.beneficiary_store_id]);
  const row = inserted.rows[0];
  return { id: Number(row.id), name: String(row.name), created: true, matched_by: '', row: { ...row, id: Number(row.id) } };
}

async function createRentalDraft(client: PoolClient, vehicleId: number, storeId: number, customer: { id: number; row: ManagementRow }, note: string, actorId: number) {
  const vehicle = (await client.query(`SELECT v.id,v.name,v.license,v.brand,v.type,v.year,v.color,COALESCE(v.current_store_id,v.store_id) AS store_id,s.store_name
    FROM himoto.vehicles v LEFT JOIN himoto.stores s ON s.id=COALESCE(v.current_store_id,v.store_id) WHERE v.id=$1`, [vehicleId])).rows[0];
  const store = (await client.query('SELECT id,store_name AS name FROM himoto.stores WHERE id=$1', [storeId])).rows[0];
  const staff = (await client.query('SELECT id,full_name FROM himoto.staff_profiles WHERE user_id=$1 AND store_id=$2 ORDER BY id LIMIT 1', [actorId, storeId])).rows[0];
  const draft = createContractDraft({ stores: [{ ...store, id: Number(store.id) }], staff: [], customers: [], contracts: [], vehicles: [] }, String(storeId));
  draft.customer_id = customer.id;
  draft.customer = { ...draft.customer, ...customerDetails(customer.row) };
  draft.vehicles = [vehicleDetails({ ...vehicle, id: Number(vehicle.id) }, draft.customer)];
  if (staff) { draft.staff_id = String(staff.id); draft.staff_name = String(staff.full_name || ''); }
  const saved = await saveDatabaseDraft(client, null, { draft, status: 'draft', rental_type: 'daily', notes: note });
  return { id: Number(saved.id), code: String(saved.contract_number || saved.draft_reference || `#${saved.id}`) };
}

// vehicle_location_events.created_at is a local (Asia/Ho_Chi_Minh) timestamp, as written by the legacy app.
export async function applyVehicleAction(client: PoolClient, vehicleId: number, input: VehicleActionInput, actorId: number): Promise<VehicleActionResult> {
  await client.query("SET LOCAL lock_timeout = '5s'");
  const found = await client.query('SELECT status, COALESCE(current_store_id,store_id) AS store_id, odometer FROM himoto.vehicles WHERE id=$1 FOR UPDATE', [vehicleId]);
  const vehicle = found.rows[0];
  if (!vehicle) throw new VehicleActionError('Không tìm thấy xe. Nhấn Làm mới để kiểm tra.', 404);
  const open = await client.query(`SELECT COALESCE(NULLIF(o.contract_number,''),NULLIF(o.draft_reference,''),'#'||o.id::text) AS code
    FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
    WHERE d.vehicle_id=$1 AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL
      AND o.order_status IN ('renting','overdue','wait_payment','pending','deposit_contract') LIMIT 1`, [vehicleId]);
  if (open.rowCount) throw new VehicleActionError(`Xe đang thuộc hợp đồng ${open.rows[0].code}. Trả xe trên hợp đồng trước khi ${input.action === 'transfer' ? 'chuyển xe' : 'đổi trạng thái'}.`, 409);
  const target = input.action === 'transfer' ? input.to_store_id : input.beneficiary_store_id;
  if (!(await client.query('SELECT 1 FROM himoto.stores WHERE id=$1', [target])).rowCount) throw new VehicleActionError('Cơ sở đã chọn không còn tồn tại.', 409);
  const current = String(vehicle.status) === 'rent' ? 'using' : String(vehicle.status);

  let customer: VehicleActionCustomer | undefined, draft: VehicleActionResult['draft'];
  if (input.action === 'transfer') {
    if (String(vehicle.store_id) === String(input.to_store_id)) throw new VehicleActionError('Xe đang ở cơ sở này. Chọn cơ sở khác để chuyển.');
    await client.query('UPDATE himoto.vehicles SET current_store_id=$2, updated_at=now() WHERE id=$1', [vehicleId, input.to_store_id]);
  } else {
    if (current === input.status) throw new VehicleActionError(`Xe đang ở trạng thái ${statusLabel(current)}.`);
    if (input.status === 'using') {
      const found = await findOrCreateCustomer(client, input);
      customer = { id: found.id, name: found.name, created: found.created, matched_by: found.matched_by };
      draft = await createRentalDraft(client, vehicleId, input.beneficiary_store_id, found, input.note, actorId);
    }
    await client.query('UPDATE himoto.vehicles SET status=$2, updated_at=now() WHERE id=$1', [vehicleId, input.status]);
  }
  const notes = input.action === 'transfer' ? input.note
    : [`${statusLabel(current)} → ${statusLabel(input.status)}`, draft ? `HĐ nháp ${draft.code}` : '', input.note].filter(Boolean).join(' · ');
  const inserted = await client.query(`INSERT INTO himoto.vehicle_location_events
      (vehicle_id,from_store_id,to_store_id,event_type,ref_type,ref_id,odometer,notes,customer_name,customer_phone,customer_id_card,created_by,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,NULLIF($8,''),NULLIF($9,''),NULLIF($10,''),NULLIF($11,''),$12,now() AT TIME ZONE 'Asia/Ho_Chi_Minh',now() AT TIME ZONE 'Asia/Ho_Chi_Minh') RETURNING id`,
    [vehicleId, vehicle.store_id, target, input.action === 'transfer' ? 'manual_transfer' : 'status_change', input.action === 'transfer' ? null : input.status, draft?.id ?? null,
      vehicle.odometer ?? null, notes, input.action === 'status' ? input.customer_name : '', input.action === 'status' ? input.customer_phone : '', input.action === 'status' ? input.customer_id_card : '', actorId]);
  return { id: vehicleId, event_id: Number(inserted.rows[0].id), ...(customer ? { customer } : {}), ...(draft ? { draft } : {}) };
}
