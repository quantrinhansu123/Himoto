import 'server-only';
import type { PoolClient } from 'pg';
import { VEHICLE_STATUSES, VEHICLE_TYPES } from '@/lib/management/config';
import type { VehicleChange } from '@/lib/management/vehicle-history';

type RecordValues = Record<string, unknown>;
const FIELDS = [
  ['name', 'Tên / dòng xe'], ['license', 'Biển số'], ['brand', 'Hãng xe'], ['type', 'Loại xe'],
  ['year', 'Năm sản xuất'], ['color', 'Màu sắc'], ['chassis', 'Số khung'], ['engine', 'Số máy'],
  ['odometer', 'Số km'], ['store_id', 'Cơ sở hiện tại'], ['status', 'Trạng thái'],
  ['beneficiary_store_id', 'Cơ sở sử dụng xe'],
] as const;
const text = (value: unknown) => value == null ? '' : String(value);
export function vehicleRevision(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{1,20}$/.test(value)) throw new Error('Phiên bản thông tin xe không hợp lệ.');
  return value;
}
export function vehicleFieldChanges(before: RecordValues, after: RecordValues, stores: Map<string, string>) {
  const display = (field: string, value: unknown) => {
    const raw = text(value);
    if (field === 'store_id' || field === 'beneficiary_store_id') return raw ? stores.get(raw) || `Cơ sở #${raw}` : '';
    if (field === 'status') { const status=({rent:'using',maintenance:'repairing',holding:'pending'} as Record<string,string>)[raw] || raw; return VEHICLE_STATUSES.find(option => option.value === status)?.label || raw; }
    if (field === 'type') return VEHICLE_TYPES.find(option => option.value === (raw==='electric'?'xe_dien':raw))?.label || raw;
    return raw;
  };
  return FIELDS.flatMap(([field, label]) => text(before[field]) === text(after[field]) ? [] : [{
    field, label, from: display(field, before[field]), to: display(field, after[field]),
    from_value: text(before[field]), to_value: text(after[field]),
  }]);
}

/** Called in the same transaction as the vehicle write. An audit failure must roll back the operation. */
export async function writeVehicleAudit(client: Pick<PoolClient, 'query'>, event: {
  vehicleId: number; before: RecordValues; after: RecordValues; actorId: number; type: string;
  fromStoreId?: unknown; toStoreId?: unknown; routeNames?: {from:string;to:string}; refType?: string | null; refId?: number | null; note: string;
  customer?: { name: string; phone: string; idCard: string };
}) {
  const from = event.fromStoreId ?? event.before.store_id, to = event.toStoreId ?? event.after.store_id;
  const ids = [...new Set([from, to, event.before.beneficiary_store_id, event.after.beneficiary_store_id].filter(value => value != null).map(String))];
  const stores = await client.query('SELECT id,store_name FROM himoto.stores WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE', [ids]);
  const names = new Map<string, string>(stores.rows.map(row => [String(row.id), String(row.store_name)]));
  const user = await client.query('SELECT name FROM himoto.users WHERE id=$1', [event.actorId]);
  if (!user.rowCount) throw new Error('Không xác định được người thao tác xe.');
  const snapshot = { version: 1, actor_id: event.actorId, actor_name: String(user.rows[0].name || `Tài khoản #${event.actorId}`),
    vehicle_name: text(event.after.name), license: text(event.after.license), from_store_name: event.routeNames?.from ?? names.get(String(from)) ?? '',
    to_store_name: event.routeNames?.to ?? names.get(String(to)) ?? '', changes: vehicleFieldChanges(event.before, event.after, names) };
  const result = await client.query(`INSERT INTO himoto.vehicle_location_events
    (vehicle_id,from_store_id,to_store_id,event_type,ref_type,ref_id,odometer,notes,customer_name,customer_phone,customer_id_card,created_by,created_at,updated_at,audit_snapshot)
    VALUES ($1,$2,$3,$4,$5,$6,$7,NULLIF($8,''),NULLIF($9,''),NULLIF($10,''),NULLIF($11,''),$12,
      now() AT TIME ZONE 'Asia/Ho_Chi_Minh',now() AT TIME ZONE 'Asia/Ho_Chi_Minh',$13::jsonb) RETURNING id`,
    [event.vehicleId, from ?? null, to ?? null, event.type, event.refType ?? null, event.refId ?? null, event.after.odometer ?? null,
      event.note, event.customer?.name || '', event.customer?.phone || '', event.customer?.idCard || '', event.actorId, JSON.stringify(snapshot)]);
  return Number(result.rows[0].id);
}

/** Historical names/labels are frozen at write time; legacy events have no invented changes. */
export function readVehicleAudit(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const snapshot = value as RecordValues;
  if (snapshot.version !== 1 || !Array.isArray(snapshot.changes)) return null;
  const changes: VehicleChange[] = snapshot.changes.filter(change => change && typeof change === 'object'
    && ['field', 'label', 'from', 'to'].every(key => typeof change[key] === 'string'));
  return { actor: text(snapshot.actor_name), vehicle_name: text(snapshot.vehicle_name), license: text(snapshot.license),
    from_store: text(snapshot.from_store_name), to_store: text(snapshot.to_store_name), changes };
}
