import 'server-only';
import { VEHICLE_ORDER_SQL } from './contract-classification';
import type { PoolClient } from 'pg';
import { deleteDatabaseStore, StoreSaveError } from './store-management';
import { referenceColumns } from './vehicle-import';

type Client = Pick<PoolClient, 'query'>;
export const BULK_DELETE_KINDS = ['customers', 'stores', 'vehicles', 'staff', 'contracts', 'transactions'] as const;
export type BulkDeleteKind = (typeof BULK_DELETE_KINDS)[number];
export const MAX_BULK_DELETE = 500;
const OPEN_STATUSES = ['renting', 'overdue', 'wait_payment', 'pending', 'deposit_contract'];
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
const list = (labels: string[]) => `${labels.slice(0, 8).join(', ')}${labels.length > 8 ? `, … (${labels.length})` : ''}`;

export class BulkDeleteError extends Error { constructor(message: string, public status = 400) { super(message); } }

export function parseBulkDelete(kind: string, body: unknown): { kind: BulkDeleteKind; ids: number[] } {
  if (!BULK_DELETE_KINDS.includes(kind as BulkDeleteKind)) throw new BulkDeleteError('Danh sách này không hỗ trợ xóa hàng loạt.', 404);
  const ids = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).ids : undefined;
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_BULK_DELETE || ids.some(id => !Number.isSafeInteger(id) || Number(id) <= 0) || new Set(ids).size !== ids.length) {
    throw new BulkDeleteError(`Chọn từ 1 đến ${MAX_BULK_DELETE} dòng hợp lệ để xóa.`);
  }
  return { kind: kind as BulkDeleteKind, ids: ids as number[] };
}

async function lockRows(client: Client, table: string, ids: number[], label: string, extra = '') {
  const rows = await client.query(`SELECT * FROM himoto.${table} WHERE id = ANY($1::bigint[]) ${extra} ORDER BY id FOR UPDATE`, [ids]);
  if (rows.rowCount !== ids.length) throw new BulkDeleteError(`Có ${label} đã bị xóa hoặc không còn tồn tại. Nhấn Làm mới rồi chọn lại.`, 409);
  return rows.rows as Record<string, unknown>[];
}

async function deleteCustomers(client: Client, ids: number[]) {
  const rows = await lockRows(client, 'customers', ids, 'khách hàng');
  const linked = await client.query('SELECT DISTINCT customer_id FROM himoto.orders WHERE customer_id = ANY($1::bigint[])', [ids]);
  if (linked.rowCount) {
    const blocked = new Set(linked.rows.map(row => Number(row.customer_id)));
    throw new BulkDeleteError(`Không xóa được vì còn đơn thuê liên quan: ${list(rows.filter(row => blocked.has(Number(row.id))).map(row => String(row.name || `#${row.id}`)))}.`, 409);
  }
  await client.query('DELETE FROM himoto.customers WHERE id = ANY($1::bigint[])', [ids]);
}

async function deleteStores(client: Client, ids: number[]) {
  for (const id of ids) {
    try { await deleteDatabaseStore(client, id); }
    catch (error) {
      if (error instanceof StoreSaveError) throw new BulkDeleteError(`Cơ sở #${id}: ${error.message}`, error.status);
      throw error;
    }
  }
}

async function deleteVehicles(client: Client, ids: number[]) {
  await client.query("SET LOCAL statement_timeout = '30s'");
  await client.query('LOCK TABLE himoto.vehicles IN SHARE ROW EXCLUSIVE MODE');
  const rows = await lockRows(client, 'vehicles', ids, 'xe');
  const columns = await referenceColumns(client);
  const used = new Set<number>();
  const textIds = ids.map(String);
  for (const column of columns) {
    const table = `${quote(column.table_schema)}.${quote(column.table_name)}`, name = quote(column.column_name);
    // Legacy relationships also live in JSON snapshots and comma-separated id lists.
    const found = ['json', 'jsonb'].includes(column.data_type)
      ? await client.query(`SELECT DISTINCT trim(both '"' from value::text) AS id FROM ${table},
          LATERAL (SELECT jsonb_path_query(${name}::jsonb, '$.**.vehicle_id') UNION ALL SELECT jsonb_path_query(${name}::jsonb, '$.**.vehicles[*].id')
            UNION ALL SELECT jsonb_path_query(${name}::jsonb, '$.**.vehicle_ids[*]')) refs(value)
          WHERE ${name} IS NOT NULL AND trim(both '"' from value::text) = ANY($1::text[])`, [textIds])
      : column.column_name === 'vehicle_ids'
        ? await client.query(`SELECT DISTINCT match[1] AS id FROM ${table}, LATERAL regexp_matches(${name}::text, '(\\d+)', 'g') match WHERE match[1] = ANY($1::text[])`, [textIds])
        : await client.query(`SELECT DISTINCT ${name}::text AS id FROM ${table} WHERE ${name}::text = ANY($1::text[])`, [textIds]);
    for (const row of found.rows) used.add(Number(row.id));
  }
  if (used.size) throw new BulkDeleteError(`Không xóa được xe đã có hợp đồng hoặc dữ liệu liên quan: ${list(rows.filter(row => used.has(Number(row.id))).map(row => String(row.license || `#${row.id}`)))}.`, 409);
  await client.query('DELETE FROM himoto.vehicles WHERE id = ANY($1::bigint[])', [ids]);
}

async function deleteStaff(client: Client, ids: number[]) {
  const rows = await lockRows(client, 'staff_profiles', ids, 'nhân sự');
  const columns = await client.query(`SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'himoto' AND table_name <> 'staff_profiles' AND (column_name = 'staff_id' OR column_name LIKE '%\\_staff_id' ESCAPE '\\')
    ORDER BY table_name, column_name`);
  const used = new Set<number>();
  for (const column of columns.rows) {
    const found = await client.query(`SELECT DISTINCT ${quote(column.column_name)}::text AS id FROM himoto.${quote(column.table_name)} WHERE ${quote(column.column_name)}::text = ANY($1::text[])`, [ids.map(String)]);
    for (const row of found.rows) used.add(Number(row.id));
  }
  if (used.size) throw new BulkDeleteError(`Không xóa được nhân sự còn lịch trực hoặc dữ liệu liên quan: ${list(rows.filter(row => used.has(Number(row.id))).map(row => String(row.full_name || `#${row.id}`)))}.`, 409);
  await client.query('DELETE FROM himoto.staff_profiles WHERE id = ANY($1::bigint[])', [ids]);
}

// Soft delete: rows keep their data (restore by clearing deleted_at). Receipts stay in the cashbook.
async function deleteContracts(client: Client, ids: number[]) {
  await lockRows(client, 'orders', ids, 'hợp đồng', 'AND deleted_at IS NULL');
  const lines = await client.query(`UPDATE himoto.order_vehicle_details SET deleted_at = now(), updated_at = now()
    WHERE order_id = ANY($1::bigint[]) AND deleted_at IS NULL RETURNING vehicle_id, completed_at`, [ids]);
  await client.query('UPDATE himoto.orders SET deleted_at = now(), updated_at = now() WHERE id = ANY($1::bigint[])', [ids]);
  const released = [...new Set(lines.rows.filter(row => !row.completed_at && row.vehicle_id != null).map(row => Number(row.vehicle_id)))];
  if (released.length) await client.query(`UPDATE himoto.vehicles v SET status = 'ready', updated_at = now()
    WHERE v.id = ANY($1::bigint[]) AND v.status = 'using' AND NOT EXISTS (
      SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id = d.order_id
      WHERE d.vehicle_id = v.id AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL} AND o.order_status = ANY($2::text[]))`, [released, OPEN_STATUSES]);
}

// Hard delete. Receipts recorded against a contract are taken back out of its collected amount (and out
// of its total for renewal/extra receipts, which raised the total when collected).
async function deleteTransactions(client: Client, ids: number[]) {
  const rows = await lockRows(client, 'transactions', ids, 'phiếu');
  const batteryIds = [...new Set(rows.filter(row=>row.object_type === 'battery_contract').map(row=>Number(row.object_id)))];
  for (const batteryId of batteryIds) {
    const receipts = rows.filter(row=>row.object_type === 'battery_contract' && Number(row.object_id) === batteryId && row.status === 'approved' && row.type === 'in');
    const paid = receipts.filter(row=>['battery:rental','battery:renewal'].includes(String(row.name))).reduce((sum,row)=>sum+Number(row.value || 0),0);
    const deposit = receipts.filter(row=>row.name === 'battery:deposit').reduce((sum,row)=>sum+Number(row.value || 0),0);
    await client.query(`UPDATE himoto.battery_contracts SET paid_amount=GREATEST(COALESCE(paid_amount,0)-$2,0),
      deposit_amount=GREATEST(COALESCE(deposit_amount,0)-$3,0),updated_at=now() WHERE id=$1`,[batteryId,paid,deposit]);
  }
  const byOrder = new Map<number, { paid: number; total: number }>();
  for (const row of rows) {
    // Cancelled/rejected/pending vouchers never contributed to the totals.
    // Removing their history must not reverse the collection a second time.
    if (row.status !== 'approved') continue;
    const rentalRefund=row.type==='out'&&row.name==='order:rental_refund'&&row.status==='approved';
    if (row.order_id == null || !rentalRefund&&!['in', 'addon'].includes(String(row.type))) continue;
    if (row.name === 'order:outside') continue;
    const order = byOrder.get(Number(row.order_id)) || { paid: 0, total: 0 };
    order.paid += (rentalRefund?-1:1)*Number(row.value || 0);
    if (['order:extra', 'order:renewal'].includes(String(row.name))) order.total += Number(row.value || 0);
    byOrder.set(Number(row.order_id), order);
  }
  for (const [orderId, change] of byOrder) {
    await client.query(`UPDATE himoto.orders SET pid = CASE WHEN pid IS NULL THEN NULL ELSE GREATEST(pid - $2, 0) END,
        total = CASE WHEN $3::bigint = 0 OR NULLIF(total::text, '') IS NULL THEN total ELSE (GREATEST(total::numeric - $3, 0))::text END, updated_at = now()
      WHERE id = $1`, [orderId, change.paid, change.total]);
  }
  const ledger = await client.query("SELECT to_regclass('himoto.management_contract_payments') IS NOT NULL AS present");
  if (ledger.rows[0].present) await client.query('DELETE FROM himoto.management_contract_payments WHERE transaction_id = ANY($1::bigint[])', [ids]);
  await client.query('DELETE FROM himoto.transactions WHERE id = ANY($1::bigint[])', [ids]);
}

// Caller owns BEGIN/COMMIT/ROLLBACK: every selected row is deleted, or none is.
export async function bulkDelete(client: Client, kind: BulkDeleteKind, ids: number[]): Promise<number[]> {
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '20s'");
  if (kind === 'customers') await deleteCustomers(client, ids);
  else if (kind === 'stores') await deleteStores(client, ids);
  else if (kind === 'vehicles') await deleteVehicles(client, ids);
  else if (kind === 'staff') await deleteStaff(client, ids);
  else if (kind === 'contracts') await deleteContracts(client, ids);
  else await deleteTransactions(client, ids);
  return ids;
}
