import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { VEHICLE_IMPORT_COLUMNS, VEHICLE_IMPORT_LIMIT, VehicleImportInput, VehicleImportMode, VehicleImportResult, VehicleImportValues, VehicleReference, VehicleResetPreview, validateVehicleImport } from '@/lib/management/vehicle-import';

export class VehicleImportError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const VEHICLE_IMPORT_BODY_LIMIT = 2 * 1024 * 1024;
type Client = Pick<PoolClient, 'query'>;
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
// JSONB changes object key order; canonical keys make downloaded backups verifiable.
export const vehicleSnapshotHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)).digest('hex');
const digest = vehicleSnapshotHash;

export function vehicleImportRequest(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new VehicleImportError('Dữ liệu nhập không hợp lệ.');
  const raw = body as Record<string, unknown>;
  if (Object.keys(raw).some(key => !['rows', 'mode', 'commit', 'revision', 'acceptWarnings', 'skipUnknownStores'].includes(key)) || !Array.isArray(raw.rows) || !raw.rows.length || raw.rows.length > VEHICLE_IMPORT_LIMIT || !['sync', 'replace'].includes(String(raw.mode)) || typeof raw.commit !== 'boolean' || typeof raw.acceptWarnings !== 'boolean' || typeof raw.skipUnknownStores !== 'boolean' || typeof raw.revision !== 'string' || raw.revision.length > 64) throw new VehicleImportError('Chế độ hoặc dữ liệu nhập không hợp lệ.');
  const rowNumbers = new Set<number>();
  const rows: VehicleImportInput[] = raw.rows.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new VehicleImportError('Dòng xe không hợp lệ.');
    const row = value as Record<string, unknown>;
    if (Object.keys(row).some(key => !['rowNumber', 'values', 'errors', 'warnings'].includes(key)) || typeof row.rowNumber !== 'number' || !Number.isSafeInteger(row.rowNumber) || row.rowNumber < 2 || row.rowNumber > 10000 || rowNumbers.has(row.rowNumber) || !row.values || typeof row.values !== 'object' || Array.isArray(row.values)) throw new VehicleImportError('Số dòng hoặc các trường xe không hợp lệ.');
    rowNumbers.add(row.rowNumber);
    const fields = row.values as Record<string, unknown>;
    if (Object.keys(fields).length !== VEHICLE_IMPORT_COLUMNS.length || Object.keys(fields).some(key => !VEHICLE_IMPORT_COLUMNS.some(column => column.key === key)) || VEHICLE_IMPORT_COLUMNS.some(column => typeof fields[column.key] !== 'string' || (fields[column.key] as string).length > 10000)) throw new VehicleImportError('Các trường xe phải là văn bản theo mẫu.');
    for (const key of ['errors', 'warnings']) if (row[key] !== undefined && (!Array.isArray(row[key]) || (row[key] as unknown[]).length > 30 || (row[key] as unknown[]).some(text => typeof text !== 'string' || text.length > 300))) throw new VehicleImportError('Thông tin đối chiếu xe không hợp lệ.');
    return { rowNumber: row.rowNumber, values: fields as VehicleImportValues, errors: row.errors as string[] | undefined, warnings: row.warnings as string[] | undefined };
  });
  return { rows, mode: raw.mode as VehicleImportMode, commit: raw.commit, revision: raw.revision, acceptWarnings: raw.acceptWarnings, skipUnknownStores: raw.skipUnknownStores };
}

async function referenceColumns(client: Client) {
  const result = await client.query(`SELECT table_schema, table_name, column_name, data_type FROM information_schema.columns
    WHERE table_schema='himoto' AND table_name <> 'vehicles'
      AND (column_name='vehicle_id' OR column_name LIKE '%\\_vehicle_id' ESCAPE '\\'
        OR (table_name='orders' AND column_name IN ('vehicle_ids', 'draft_payload', 'contract_snapshot')))
    ORDER BY table_name, column_name`);
  // Include declared FKs with nonstandard column names, even in another schema.
  const declared = await client.query(`SELECT ns.nspname AS table_schema, t.relname AS table_name, a.attname AS column_name,
      format_type(a.atttypid, a.atttypmod) AS data_type FROM pg_constraint f
    JOIN pg_class t ON t.oid=f.conrelid JOIN pg_namespace ns ON ns.oid=t.relnamespace
    JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=ANY(f.conkey)
    WHERE f.contype='f' AND f.confrelid='himoto.vehicles'::regclass`);
  const unique = new Map<string, { table_schema: string; table_name: string; column_name: string; data_type: string }>();
  for (const row of [...result.rows, ...declared.rows]) unique.set(`${row.table_schema}.${row.table_name}.${row.column_name}`, row);
  return [...unique.values()];
}
async function lockVehicles(client: Client) {
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL statement_timeout='30s'");
  await client.query('LOCK TABLE himoto.vehicles IN SHARE ROW EXCLUSIVE MODE');
  const references = await referenceColumns(client);
  const tables = [...new Set(references.map(row => `${quote(row.table_schema)}.${quote(row.table_name)}`))].sort();
  if (tables.length) await client.query(`LOCK TABLE ${tables.join(', ')} IN SHARE MODE`);
  return references;
}
async function countReferences(client: Client, columns: Awaited<ReturnType<typeof referenceColumns>>): Promise<VehicleReference[]> {
  const references: VehicleReference[] = [];
  for (const row of columns) {
    const table = `${quote(row.table_schema)}.${quote(row.table_name)}`, column = quote(row.column_name);
    // JSON snapshots and legacy comma-separated IDs also carry relationships.
    const condition = ['json', 'jsonb'].includes(row.data_type)
      ? `jsonb_path_exists(${column}::jsonb, '$.**.vehicle_id ? (@ != null && @ != "")') OR jsonb_path_exists(${column}::jsonb, '$.**.vehicles[*].id ? (@ != null && @ != "")') OR jsonb_path_exists(${column}::jsonb, '$.**.vehicle_ids[*] ? (@ != null && @ != "")')`
      : row.column_name === 'vehicle_ids'
        ? `${column} IS NOT NULL AND btrim(${column}::text) NOT IN ('', '[]', 'null')`
        : `${column} IN (SELECT id FROM himoto.vehicles)`;
    const result = await client.query(`SELECT count(*)::int AS count FROM ${table} WHERE ${condition}`);
    if (result.rows[0].count) references.push({ table: row.table_schema === 'himoto' ? row.table_name : `${row.table_schema}.${row.table_name}`, column: row.column_name, count: Number(result.rows[0].count) });
  }
  return references;
}
const referenceBlocking = (references: VehicleReference[]) => references.length ? ['Không thể xóa / thay toàn bộ xe vì còn hợp đồng hoặc dữ liệu liên quan. Chọn Đồng bộ giữ ID và lịch sử.'] : [];

async function snapshot(client: Client) { return (await client.query('SELECT * FROM himoto.vehicles ORDER BY id')).rows; }
async function backup(client: Client, rows: unknown[], action: string, actorId: number) {
  const id = randomUUID();
  await client.query(`INSERT INTO himoto.vehicle_import_backups (id, action, created_by, row_count, sha256, payload)
    VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)`, [id, action, actorId, rows.length, digest(rows), JSON.stringify(rows)]);
  return id;
}

export async function importDatabaseVehicles(client: Client, request: ReturnType<typeof vehicleImportRequest>, actorId: number): Promise<VehicleImportResult> {
  const columns = request.commit ? await lockVehicles(client) : request.mode === 'replace' ? await referenceColumns(client) : [];
  const before = await snapshot(client);
  const stores = await client.query(`SELECT id, store_name AS name, code FROM himoto.stores ORDER BY id${request.commit ? ' FOR SHARE' : ''}`);
  const rows = validateVehicleImport(request.rows, stores.rows, before, request.mode, request.skipUnknownStores);
  const eligible = rows.filter(row => row.state !== 'skipped');
  const revision = digest({ before, stores: stores.rows, inputs: request.rows, mode: request.mode, skipUnknownStores: request.skipUnknownStores });
  const references = request.mode === 'replace' ? await countReferences(client, columns) : [];
  const present = new Set(eligible.filter(row => row.action === 'update').map(row => row.targetId));
  const result: VehicleImportResult = { rows, total: rows.length, valid: rows.filter(row => row.state === 'valid').length,
    invalid: rows.filter(row => row.state === 'invalid').length, skipped: rows.filter(row => row.state === 'skipped').length, inserted: eligible.filter(row => row.action === 'insert').length,
    updated: eligible.filter(row => row.action === 'update').length, blankColors: eligible.filter(row => !row.values.color).length,
    retained: request.mode === 'sync' ? before.filter(row => !present.has(Number(row.id))).length : 0,
    existing: before.length, revision, committed: false, blocking: referenceBlocking(references), references };
  if (!request.commit) return result;
  if (request.revision !== revision) throw new VehicleImportError('Xe, cơ sở hoặc file đã thay đổi sau kiểm tra. Kiểm tra lại trước khi nhập.', 409);
  if (!eligible.length || result.invalid || result.blocking.length) throw new VehicleImportError(result.blocking[0] || 'File không có xe đủ điều kiện hoặc còn dòng lỗi. Đã hủy toàn bộ lần nhập.', 409);
  if (!request.acceptWarnings && rows.some(row => row.warnings.length)) throw new VehicleImportError('Cần xác nhận đã đối chiếu các cảnh báo trước khi nhập.');
  if (!Number.isSafeInteger(actorId) || actorId <= 0) throw new VehicleImportError('Phiên quản trị không hợp lệ.', 401);
  const backupId = await backup(client, before, request.mode, actorId);
  if (request.mode === 'replace') await client.query('DELETE FROM himoto.vehicles');
  const updates = eligible.filter(row => row.action === 'update');
  if (updates.length) {
    const values: unknown[] = [];
    const tuples = updates.map(row => {
      const offset = values.length; const v = row.values;
      values.push(row.targetId, v.name, v.brand, v.type, v.year, v.license, v.color, v.chassis, v.engine, v.odometer);
      const casts = ['bigint', 'text', 'text', 'text', 'bigint', 'text', 'text', 'text', 'text', 'bigint'];
      return `(${casts.map((cast, i) => `NULLIF($${offset + i + 1}::text, '')::${cast}`).join(',')})`;
    });
    const changed = await client.query(`UPDATE himoto.vehicles AS v SET name=d.name, brand=d.brand, type=d.type, year=d.year,
      license=d.license, color=COALESCE(d.color, v.color), chassis=COALESCE(d.chassis, v.chassis), engine=COALESCE(d.engine, v.engine),
      odometer=COALESCE(d.odometer, v.odometer), updated_at=now()
      FROM (VALUES ${tuples.join(',')}) AS d(id,name,brand,type,year,license,color,chassis,engine,odometer)
      WHERE v.id=d.id RETURNING v.id`, values);
    if (changed.rowCount !== updates.length) throw new VehicleImportError('Không cập nhật đủ xe. Đã hủy toàn bộ lần nhập.', 500);
  }
  const inserts = eligible.filter(row => row.action === 'insert');
  if (inserts.length) {
    const explicitMax = Math.max(0, ...inserts.map(row => row.targetId || 0));
    // Never rewind the shared sequence. Sequence gaps after rollback are safe.
    await client.query(`SELECT setval('himoto.vehicles_id_seq', GREATEST((SELECT last_value FROM himoto.vehicles_id_seq), COALESCE((SELECT max(id) FROM himoto.vehicles), 0), $1::bigint, 1), true)`, [explicitMax]);
    const values: unknown[] = [];
    const tuples = inserts.map(row => {
      const v = row.values, offset = values.length;
      values.push(row.targetId, v.name, v.brand, v.type, v.year, v.license, v.color || null, v.chassis || null, v.engine || null, row.storeId, v.status, v.odometer || null, actorId);
      const params = Array.from({ length: 13 }, (_, i) => `$${offset + i + 1}`);
      return `(COALESCE(${params[0]}::bigint,nextval('himoto.vehicles_id_seq')),${params.slice(1).join(',')},${params[9]},now(),now())`;
    });
    const added = await client.query(`INSERT INTO himoto.vehicles (id,name,brand,type,year,license,color,chassis,engine,store_id,status,odometer,created_by,current_store_id,created_at,updated_at)
      VALUES ${tuples.join(',')} RETURNING id`, values);
    if (added.rowCount !== inserts.length) throw new VehicleImportError('Không nhập đủ xe. Đã hủy toàn bộ lần nhập.', 500);
  }
  const after = await client.query('SELECT count(*)::int AS total FROM himoto.vehicles');
  const expected = request.mode === 'replace' ? eligible.length : before.length + inserts.length;
  if (Number(after.rows[0].total) !== expected) throw new VehicleImportError('Số xe sau nhập không khớp. Đã hủy toàn bộ lần nhập.', 500);
  return { ...result, committed: true, backupId };
}

export async function previewVehicleReset(client: Client, locked = false): Promise<VehicleResetPreview> {
  const columns = locked ? await lockVehicles(client) : await referenceColumns(client);
  const rows = await snapshot(client);
  const references = await countReferences(client, columns);
  return { total: rows.length, revision: digest(rows), references, blocking: referenceBlocking(references) };
}
export async function resetDatabaseVehicles(client: Client, body: unknown, actorId: number) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new VehicleImportError('Yêu cầu xóa không hợp lệ.');
  const raw = body as Record<string, unknown>;
  if (Object.keys(raw).some(key => !['revision', 'confirmation'].includes(key)) || raw.confirmation !== 'XÓA HẾT XE' || typeof raw.revision !== 'string' || raw.revision.length !== 64) throw new VehicleImportError('Cần nhập đúng XÓA HẾT XE để xác nhận.');
  const preview = await previewVehicleReset(client, true);
  if (raw.revision !== preview.revision) throw new VehicleImportError('Danh sách xe đã thay đổi. Mở lại hộp thoại để kiểm tra.', 409);
  if (preview.blocking.length) throw new VehicleImportError(preview.blocking[0], 409);
  if (!preview.total) throw new VehicleImportError('Danh sách xe đã trống.');
  if (!Number.isSafeInteger(actorId) || actorId <= 0) throw new VehicleImportError('Phiên quản trị không hợp lệ.', 401);
  const backupId = await backup(client, await snapshot(client), 'reset', actorId);
  const removed = await client.query('DELETE FROM himoto.vehicles RETURNING id');
  if (removed.rowCount !== preview.total) throw new VehicleImportError('Không xác nhận được số xe đã xóa. Đã hủy thao tác.', 500);
  return { removed: removed.rowCount, backupId };
}

export async function readVehicleRequestBody(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > VEHICLE_IMPORT_BODY_LIMIT || !request.body) throw new VehicleImportError('Yêu cầu trống hoặc vượt giới hạn 2 MB.', 413);
  const reader = request.body.getReader(), decoder = new TextDecoder(); let length = 0, text = '';
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      length += part.value.byteLength;
      if (length > VEHICLE_IMPORT_BODY_LIMIT) { await reader.cancel(); throw new VehicleImportError('Dữ liệu vượt giới hạn 2 MB.', 413); }
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally { reader.releaseLock(); }
}
