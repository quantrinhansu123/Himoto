import 'server-only';
import type { PoolClient } from 'pg';
import { StoreCreation, StoreEdits, validateStoreCreation, validateStoreEdits } from '@/lib/management/store-management';

export class StoreSaveError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export const STORE_SELECT_SQL = `SELECT s.id, s.code, s.store_name, s.store_phone, s.store_address, s.status,
  s.user_id, s.kind, COALESCE(s.updated_at::text, '') AS store_revision, u.name AS manager_name,
  (SELECT count(*)::int FROM himoto.vehicles v WHERE v.current_store_id = s.id) AS vehicle_count,
  (SELECT count(*)::int FROM himoto.staff_profiles p WHERE p.store_id = s.id) AS staff_count
  FROM himoto.stores s LEFT JOIN himoto.users u ON u.id = s.user_id AND u.deleted_at IS NULL`;

export function parseStoreEdits(body: unknown): StoreEdits {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new StoreSaveError('Thông tin cơ sở không hợp lệ.');
  const raw = body as Record<string, unknown>;
  const fields = ['name', 'phone', 'address', 'status', 'user_id', 'revision'];
  if (Object.keys(raw).some(key => !fields.includes(key)) || ['name', 'phone', 'address', 'status', 'revision'].some(key => typeof raw[key] !== 'string')) throw new StoreSaveError('Các trường cơ sở không hợp lệ.');
  const edits: StoreEdits = { name: (raw.name as string).trim(), phone: (raw.phone as string).trim(), address: (raw.address as string).trim(), status: raw.status as string, user_id: raw.user_id as number | null, revision: raw.revision as string };
  if (edits.user_id !== null && typeof edits.user_id !== 'number') throw new StoreSaveError('Người phụ trách không hợp lệ.');
  if (edits.revision.length > 100 || Object.keys(validateStoreEdits(edits)).length) throw new StoreSaveError('Kiểm tra tên, số điện thoại, địa chỉ, người phụ trách và trạng thái cơ sở.');
  return edits;
}

export function parseStoreCreation(body: unknown): StoreCreation {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new StoreSaveError('Thông tin cơ sở không hợp lệ.');
  const raw = body as Record<string, unknown>;
  const fields = ['name', 'phone', 'address', 'status', 'user_id', 'code', 'kind'];
  if (Object.keys(raw).some(key => !fields.includes(key)) || ['name', 'phone', 'address', 'status', 'code', 'kind'].some(key => typeof raw[key] !== 'string')) throw new StoreSaveError('Các trường tạo cơ sở không hợp lệ.');
  const store: StoreCreation = { name: (raw.name as string).trim(), phone: (raw.phone as string).trim(), address: (raw.address as string).trim(), status: raw.status as string,
    user_id: raw.user_id as number | null, code: (raw.code as string).trim().toUpperCase(), kind: raw.kind as string };
  if (store.user_id !== null && typeof store.user_id !== 'number') throw new StoreSaveError('Người phụ trách không hợp lệ.');
  if (Object.keys(validateStoreCreation(store)).length) throw new StoreSaveError('Kiểm tra tên, mã, loại cơ sở, số điện thoại, người phụ trách và trạng thái.');
  return store;
}

export async function createDatabaseStore(client: Pick<PoolClient, 'query'>, store: StoreCreation) {
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query('LOCK TABLE himoto.stores IN SHARE ROW EXCLUSIVE MODE');
  const duplicate = await client.query(`SELECT id FROM himoto.stores WHERE lower(btrim(store_name))=lower($1)
    OR ($2 <> '' AND upper(btrim(code))=$2) LIMIT 1`, [store.name, store.code]);
  if (duplicate.rowCount) throw new StoreSaveError('Tên hoặc mã cơ sở này đã có trong danh sách.', 409);
  if (store.user_id !== null) {
    const manager = await client.query("SELECT id FROM himoto.users WHERE id=$1 AND deleted_at IS NULL AND status='active' FOR SHARE", [store.user_id]);
    if (!manager.rowCount) throw new StoreSaveError('Người phụ trách không tồn tại hoặc đã ngừng hoạt động. Chọn lại tài khoản.');
  }
  const inserted = await client.query(`INSERT INTO himoto.stores (store_name, store_phone, store_address, user_id, status, code, kind, created_at, updated_at)
    VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), $4, $5, NULLIF($6, ''), $7, now(), now()) RETURNING id`,
    [store.name, store.phone, store.address, store.user_id, store.status === 'active' ? 'opening' : 'inactive', store.code, store.kind]);
  const id = Number(inserted.rows[0]?.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new StoreSaveError('Chưa xác nhận được cơ sở mới.', 500);
  if (!store.code) {
    const baseCode = `CS-${String(id).padStart(3, '0')}`;
    let code = baseCode;
    for (let suffix = 1; ; suffix++) {
      const used = await client.query('SELECT id FROM himoto.stores WHERE upper(btrim(code))=$1 LIMIT 1', [code]);
      if (!used.rowCount) break;
      if (suffix > 100) throw new StoreSaveError('Không tạo được mã cơ sở. Hãy nhập mã riêng.', 409);
      code = `${baseCode}-${suffix}`;
    }
    await client.query('UPDATE himoto.stores SET code=$2 WHERE id=$1', [id, code]);
  }
  const result = await client.query(`${STORE_SELECT_SQL} WHERE s.id=$1`, [id]);
  if (!result.rowCount) throw new StoreSaveError('Không đọc được cơ sở vừa tạo.', 500);
  return result.rows[0];
}

export async function saveDatabaseStore(client: Pick<PoolClient, 'query'>, id: number, edits: StoreEdits) {
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query('LOCK TABLE himoto.stores IN SHARE ROW EXCLUSIVE MODE');
  const current = await client.query("SELECT id, user_id, COALESCE(updated_at::text, '') AS revision FROM himoto.stores WHERE id=$1 FOR UPDATE", [id]);
  if (!current.rowCount) throw new StoreSaveError('Không tìm thấy cơ sở cần sửa.', 404);
  if (current.rows[0].revision !== edits.revision) throw new StoreSaveError('Cơ sở đã được người khác cập nhật. Nhấn Làm mới và mở lại để sửa.', 409);
  const duplicate = await client.query('SELECT id FROM himoto.stores WHERE id <> $1 AND lower(btrim(store_name)) = lower($2) LIMIT 1', [id, edits.name]);
  if (duplicate.rowCount) throw new StoreSaveError('Tên cơ sở này đã có trong danh sách.', 409);
  if (edits.user_id !== null && Number(current.rows[0].user_id) !== edits.user_id) {
    const manager = await client.query("SELECT id FROM himoto.users WHERE id=$1 AND deleted_at IS NULL AND status='active' FOR SHARE", [edits.user_id]);
    if (!manager.rowCount) throw new StoreSaveError('Người phụ trách không tồn tại hoặc đã ngừng hoạt động. Chọn lại tài khoản.');
  }
  await client.query(`UPDATE himoto.stores SET store_name=$2, store_phone=NULLIF($3, ''), store_address=NULLIF($4, ''), user_id=$5, status=$6, updated_at=now() WHERE id=$1`,
    [id, edits.name, edits.phone, edits.address, edits.user_id, edits.status === 'active' ? 'opening' : 'inactive']);
  const result = await client.query(`${STORE_SELECT_SQL} WHERE s.id=$1`, [id]);
  if (!result.rowCount) throw new StoreSaveError('Không đọc được cơ sở vừa cập nhật.', 500);
  return result.rows[0];
}

const referenceLabels: Record<string, string> = {
  vehicles: 'xe', staff_profiles: 'nhân sự', customers: 'khách hàng', orders: 'đơn thuê', users: 'tài khoản',
  transactions: 'giao dịch', lease_contracts: 'hợp đồng thuê mua', cash: 'sổ quỹ', banks: 'tài khoản ngân hàng',
  store_duty_schedules: 'lịch trực', staff_attendances: 'chấm công', vehicle_transfers: 'điều chuyển xe',
  vehicle_location_events: 'lịch sử vị trí xe', leads: 'khách tiềm năng', sell_orders: 'đơn bán xe',
};
const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;

export async function deleteDatabaseStore(client: Pick<PoolClient, 'query'>, id: number) {
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '15s'");
  await client.query('LOCK TABLE himoto.stores IN SHARE ROW EXCLUSIVE MODE');
  // This legacy schema has no foreign keys. Discover every store reference and
  // block concurrent writes while checking, including archived/deleted records.
  const references = await client.query(`SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='himoto' AND table_name <> 'stores'
      AND (column_name='store_id' OR column_name LIKE '%\\_store_id' ESCAPE '\\')
    ORDER BY table_name, column_name`);
  const tables = new Map<string, string[]>();
  for (const reference of references.rows) tables.set(reference.table_name, [...(tables.get(reference.table_name) || []), reference.column_name]);
  if (tables.size) await client.query(`LOCK TABLE ${[...tables.keys()].map(name => `himoto.${quoteIdentifier(name)}`).join(', ')} IN SHARE MODE`);
  const store = await client.query('SELECT id FROM himoto.stores WHERE id=$1 FOR UPDATE', [id]);
  if (!store.rowCount) throw new StoreSaveError('Không tìm thấy cơ sở cần xóa.', 404);
  const linked: string[] = [];
  for (const [table, columns] of tables) {
    const result = await client.query(`SELECT 1 FROM himoto.${quoteIdentifier(table)} WHERE ${columns.map(column => `${quoteIdentifier(column)}=$1`).join(' OR ')} LIMIT 1`, [id]);
    if (result.rowCount) linked.push(referenceLabels[table] || table);
  }
  if (linked.length) throw new StoreSaveError(`Không thể xóa cơ sở vì còn dữ liệu liên quan: ${linked.slice(0, 8).join(', ')}${linked.length > 8 ? ', …' : ''}. Có thể chọn Tạm ngừng để giữ lịch sử.`, 409);
  const removed = await client.query('DELETE FROM himoto.stores WHERE id=$1 RETURNING id', [id]);
  if (!removed.rowCount) throw new StoreSaveError('Không tìm thấy cơ sở cần xóa.', 404);
}
