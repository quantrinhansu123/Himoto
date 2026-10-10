import 'server-only';
import type { PoolClient } from 'pg';
import type { ReturnableContractItem, ReturnInput, ReturnResult } from '@/lib/management/contract-returns';

type Database = Pick<PoolClient, 'query'>;
export class ContractReturnError extends Error { constructor(message: string, public status = 400) { super(message); } }
const MAX_RETURN_RATE = 5_000_000;
const MAX_MONEY = 9_999_999_999_999;
const localTimestamp = (value: string) => `${value}:00+07:00`;
function toIso(value: unknown): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export function parseReturnInput(body: unknown): ReturnInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ContractReturnError('Thông tin trả xe không hợp lệ.');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !['item_id', 'item_revision', 'returned_at', 'hourly_rate', 'fee_override'].includes(key)) ||
      !Number.isSafeInteger(input.item_id) || Number(input.item_id) <= 0 || typeof input.item_revision !== 'string' || !/^\d{1,20}$/.test(input.item_revision) ||
      typeof input.returned_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.returned_at) ||
      typeof input.hourly_rate !== 'string' || !/^\d{1,7}$/.test(input.hourly_rate) || Number(input.hourly_rate) > MAX_RETURN_RATE ||
      (input.fee_override !== undefined && (typeof input.fee_override !== 'string' || !/^\d{1,13}$/.test(input.fee_override) || Number(input.fee_override) > MAX_MONEY))) throw new ContractReturnError('Kiểm tra giờ trả, đơn giá trễ và phí trả xe.');
  const returned = new Date(localTimestamp(input.returned_at));
  if (!Number.isFinite(returned.getTime()) || new Date(returned.getTime() + 7 * 3_600_000).toISOString().slice(0, 16) !== input.returned_at) throw new ContractReturnError('Thời gian trả xe không hợp lệ.');
  if (returned.getTime() > Date.now() + 5 * 60_000) throw new ContractReturnError('Thời gian trả xe không được nằm trong tương lai.');
  return { item_id: Number(input.item_id), item_revision: input.item_revision, returned_at: input.returned_at, hourly_rate: input.hourly_rate,
    ...(input.fee_override === undefined ? {} : { fee_override: input.fee_override as string }) };
}

const RETURNABLE_SQL = `SELECT d.id AS item_id,o.id AS order_id,
  COALESCE(NULLIF(o.contract_number,''),NULLIF(o.draft_reference,''),'#'||o.id::text) AS contract_code,
  CASE WHEN o.order_status='renting' AND d.return_at < now() THEN 'overdue' ELSE o.order_status END AS order_status,
  COALESCE(c.name,o.customer_name,'') AS customer_name,COALESCE(c.id_card::text,o.customer_idnumber::text,'') AS customer_id_card,
  v.id AS vehicle_id,v.name AS vehicle_name,v.license, o.store_id,s.store_name,
  d.rent_at AS scheduled_start_at,d.return_at AS scheduled_return_at,d.completed_at,d.xmin::text AS item_revision,o.xmin::text AS order_revision,
  NULLIF(o.total::text,'')::numeric AS total_amount,NULLIF(o.pid::text,'')::numeric AS paid_amount,
  (d.completed_at IS NULL AND d.return_at < now()) AS overdue
  FROM himoto.order_vehicle_details d
  JOIN himoto.orders o ON o.id=d.order_id
  JOIN himoto.vehicles v ON v.id=d.vehicle_id
  LEFT JOIN himoto.customers c ON c.id=o.customer_id
  LEFT JOIN himoto.stores s ON s.id=o.store_id
  WHERE d.deleted_at IS NULL AND o.deleted_at IS NULL
    AND o.order_status IN ('renting','overdue','wait_payment','completed')`;

function mapReturnableRows(rows: Record<string, unknown>[]): ReturnableContractItem[] {
  return rows.map(row => ({ item_id: Number(row.item_id), order_id: Number(row.order_id), contract_code: String(row.contract_code),
    order_status: String(row.order_status), customer_name: String(row.customer_name), customer_id_card: String(row.customer_id_card),
    vehicle_id: Number(row.vehicle_id), vehicle_name: String(row.vehicle_name || ''), license: String(row.license || ''),
    store_id: Number(row.store_id), store_name: String(row.store_name || ''), scheduled_start_at: toIso(row.scheduled_start_at), scheduled_return_at: toIso(row.scheduled_return_at), completed_at: toIso(row.completed_at),
    item_revision: String(row.item_revision), order_revision: String(row.order_revision),
    total_amount: row.total_amount == null ? null : Number(row.total_amount), paid_amount: row.paid_amount == null ? null : Number(row.paid_amount), overdue: Boolean(row.overdue) }));
}

export async function searchReturnableItems(client: Database, query: string): Promise<ReturnableContractItem[]> {
  const text = query.trim().slice(0, 100);
  if (!text) return [];
  const pattern = `%${text.replace(/[\\%_]/g, '\\$&')}%`;
  const digits = text.replace(/\D/g, '');
  const result = await client.query(`${RETURNABLE_SQL}
    AND (COALESCE(NULLIF(o.contract_number,''),NULLIF(o.draft_reference,''),'#'||o.id::text) ILIKE $1 ESCAPE '\\' OR ($2 <> '' AND regexp_replace(COALESCE(c.id_card::text,o.customer_idnumber::text,''),'\\D','','g')=$2))
    ORDER BY (d.completed_at IS NULL) DESC,d.return_at ASC NULLS LAST,d.id LIMIT 100`, [pattern, digits]);
  return mapReturnableRows(result.rows);
}

export async function loadContractReturnableItems(client: Database, orderId: number): Promise<ReturnableContractItem[]> {
  if (!Number.isSafeInteger(orderId) || orderId <= 0) return [];
  const result = await client.query(`${RETURNABLE_SQL} AND o.id=$1 ORDER BY (d.completed_at IS NULL) DESC,d.return_at ASC NULLS LAST,d.id`, [orderId]);
  return mapReturnableRows(result.rows);
}

export async function recordVehicleReturn(client: Database, actorId: number, input: ReturnInput): Promise<ReturnResult> {
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '15s'");
  const itemResult = await client.query(`SELECT d.id,d.order_id,d.vehicle_id,d.return_at,d.xmin::text AS item_revision,
      o.order_status,o.total,o.pid,o.xmin::text AS order_revision,
      COALESCE(NULLIF(o.contract_number,''),o.draft_reference,'#'||o.id::text) AS contract_code
    FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
    WHERE d.id=$1 AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL
      AND o.order_status IN ('renting','overdue','wait_payment') FOR UPDATE OF d,o`, [input.item_id]);
  const item = itemResult.rows[0];
  if (!item) throw new ContractReturnError('Không tìm thấy xe đang thuê cần trả.', 404);
  if (String(item.item_revision) !== input.item_revision) throw new ContractReturnError('Chi tiết xe đã thay đổi. Tải lại danh sách trước khi trả.', 409);
  if (!item.return_at) throw new ContractReturnError('Hợp đồng chưa có hạn trả xe. Cập nhật hợp đồng trước khi ghi nhận trả xe.', 409);
  const scheduledMs = new Date(toIso(item.return_at)!).getTime();
  const returnedMs = new Date(localTimestamp(input.returned_at)).getTime();
  const lateMinutes = Math.max(0, Math.ceil((returnedMs - scheduledMs) / 60_000));
  const chargeableHours = Math.ceil(lateMinutes / 60);
  const hourlyRate = Number(input.hourly_rate);
  if (input.fee_override !== undefined && chargeableHours === 0) throw new ContractReturnError('Chỉ có thể điều chỉnh phí khi xe trả trễ hạn.');
  const fee = input.fee_override === undefined ? chargeableHours * hourlyRate : Number(input.fee_override);
  if (!Number.isSafeInteger(fee) || fee > MAX_MONEY) throw new ContractReturnError('Tiền trả muộn vượt giới hạn lưu trữ.');
  const oldTotal = item.total == null || item.total === '' ? null : Number(item.total);
  const paid = item.pid == null || item.pid === '' ? 0 : Number(item.pid);
  if (fee && (oldTotal === null || !Number.isSafeInteger(oldTotal) || oldTotal + fee > MAX_MONEY)) throw new ContractReturnError('Chưa có tổng phí hợp đồng hợp lệ để cộng phí trả muộn.', 409);

  const actual = localTimestamp(input.returned_at);
  await client.query('UPDATE himoto.order_vehicle_details SET completed_at=$2::timestamptz,updated_at=now() WHERE id=$1', [input.item_id, actual]);
  const open = await client.query(`SELECT count(*)::int AS count, bool_or(d.return_at < now()) AS has_overdue
    FROM himoto.order_vehicle_details d WHERE d.order_id=$1 AND d.deleted_at IS NULL AND d.completed_at IS NULL`, [item.order_id]);
  const remainingItems = Number(open.rows[0].count);
  const nextTotal = oldTotal === null ? null : oldTotal + fee;
  const nextStatus = remainingItems
    ? (open.rows[0].has_overdue ? 'overdue' : item.order_status === 'wait_payment' ? 'wait_payment' : 'renting')
    : nextTotal !== null && nextTotal > paid ? 'wait_payment' : 'completed';
  const returnAdjustment = { item_id: input.item_id, vehicle_id: Number(item.vehicle_id), scheduled_return_at: toIso(item.return_at),
    actual_return_at: actual, late_minutes: lateMinutes, chargeable_hours: chargeableHours, hourly_rate: hourlyRate, fee, actor_id: actorId };
  await client.query(`UPDATE himoto.orders SET
      total=CASE WHEN $2::bigint=0 THEN total ELSE ($3::numeric)::text END,
      draft_payload=(jsonb_set(COALESCE(draft_payload::jsonb,'{}'::jsonb),'{management_composer}',
        jsonb_set(CASE WHEN jsonb_typeof(draft_payload::jsonb->'management_composer')='object'
          THEN draft_payload::jsonb->'management_composer' ELSE '{}'::jsonb END,'{return_adjustments}',
          COALESCE(draft_payload::jsonb #> '{management_composer,return_adjustments}','[]'::jsonb) || $5::jsonb,true),true)::json,
      order_status=$4,updated_at=now() WHERE id=$1`, [item.order_id,fee,nextTotal ?? 0,nextStatus,JSON.stringify([returnAdjustment])]);
  const vehicleOpen = await client.query(`SELECT 1 FROM himoto.order_vehicle_details WHERE vehicle_id=$1 AND deleted_at IS NULL AND completed_at IS NULL LIMIT 1`, [item.vehicle_id]);
  if (!vehicleOpen.rowCount) await client.query(`UPDATE himoto.vehicles SET status=CASE WHEN status IN ('using','rent') THEN 'ready' ELSE status END,updated_at=now() WHERE id=$1`, [item.vehicle_id]);
  return { item_id: input.item_id, contract_code: String(item.contract_code), returned_at: actual, scheduled_return_at: toIso(item.return_at)!,
    late_minutes: lateMinutes, chargeable_hours: chargeableHours, hourly_rate: hourlyRate, fee, total_amount: nextTotal, status: nextStatus };
}

export async function replaceContractVehicle(client: Database, actorId: number, input: { item_id: number; item_revision: string; vehicle_id: number }) {
  await client.query("SET LOCAL lock_timeout = '5s'");
  const result = await client.query(`SELECT d.id,d.order_id,d.vehicle_id,d.xmin::text AS item_revision,o.store_id
    FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
    WHERE d.id=$1 AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL
      AND o.order_status IN ('renting','overdue','wait_payment') FOR UPDATE OF d,o`, [input.item_id]);
  const item = result.rows[0];
  if (!item) throw new ContractReturnError('Không tìm thấy xe đang thuê cần đổi.', 404);
  if (String(item.item_revision) !== input.item_revision) throw new ContractReturnError('Chi tiết xe đã thay đổi. Tải lại danh sách trước khi đổi.', 409);
  if (Number(item.vehicle_id) === input.vehicle_id) throw new ContractReturnError('Biển số xe đang chọn không thay đổi.');
  const newVehicle = await client.query(`SELECT id,license FROM himoto.vehicles
    WHERE id=$1 AND COALESCE(current_store_id,store_id)=$2 AND status='ready' FOR UPDATE`, [input.vehicle_id,item.store_id]);
  if (!newVehicle.rowCount) throw new ContractReturnError('Xe mới phải sẵn sàng tại đúng cơ sở của hợp đồng.', 409);
  const duplicate = await client.query(`SELECT 1 FROM himoto.order_vehicle_details
    WHERE order_id=$1 AND vehicle_id=$2 AND id<>$3 AND deleted_at IS NULL AND completed_at IS NULL LIMIT 1`, [item.order_id,input.vehicle_id,input.item_id]);
  if (duplicate.rowCount) throw new ContractReturnError('Xe mới đã nằm trong hợp đồng này.', 409);
  const oldVehicle = await client.query('SELECT license FROM himoto.vehicles WHERE id=$1 FOR UPDATE', [item.vehicle_id]);
  await client.query('UPDATE himoto.order_vehicle_details SET vehicle_id=$2,updated_at=now() WHERE id=$1', [input.item_id,input.vehicle_id]);
  await client.query(`INSERT INTO himoto.management_contract_vehicle_swaps(order_id,order_item_id,from_vehicle_id,to_vehicle_id,actor_id)
    VALUES ($1,$2,$3,$4,$5)`, [item.order_id,input.item_id,item.vehicle_id,input.vehicle_id,actorId]);
  const oldOpen = await client.query(`SELECT 1 FROM himoto.order_vehicle_details WHERE vehicle_id=$1 AND deleted_at IS NULL AND completed_at IS NULL LIMIT 1`, [item.vehicle_id]);
  if (!oldOpen.rowCount) await client.query(`UPDATE himoto.vehicles SET status=CASE WHEN status IN ('using','rent') THEN 'ready' ELSE status END,updated_at=now() WHERE id=$1`, [item.vehicle_id]);
  await client.query(`UPDATE himoto.vehicles SET status='using',updated_at=now() WHERE id=$1`, [input.vehicle_id]);
  return { item_id: input.item_id, old_license: String(oldVehicle.rows[0]?.license || ''), new_license: String(newVehicle.rows[0].license || '') };
}
