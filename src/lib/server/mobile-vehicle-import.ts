import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { NextRequest } from 'next/server';
import type { SessionUser } from './management-session';
import { withMobileData } from './mobile-context';
import { himotoPool } from './himoto-database';
import { MobileError } from './mobile-session';
import { mobileBody, mobileRequestKey } from './mobile-writes';
import { hasPermission } from '@/lib/management/permissions';
import { VEHICLE_TYPES, VEHICLE_STATUSES } from '@/lib/management/config';
import { vehicleImportRequest, importDatabaseVehicles, previewVehicleReset, resetDatabaseVehicles, VehicleImportError, vehicleSnapshotHash, VEHICLE_IMPORT_BODY_LIMIT } from './vehicle-import';
import { readVehicleExcel, createVehicleTemplate } from '@/lib/management/vehicle-excel';
import { VEHICLE_EXCEL_MAX_BYTES } from '@/lib/management/vehicle-import';
import { isImportUuid } from '../../../shared/mobile-customer-import';
import { isMobileVehicleWorkbook, isMobileVehicleImportPreview, isMobileVehicleResetPreview, isMobileVehicleImportReceipt, isVehicleImportOperation, type MobileVehicleImportReceipt, type MobileVehicleImportMode, type MobileVehicleWorkbook, type MobileVehicleImportResolution } from '../../../shared/mobile-vehicle-import';
import type { MobileWorkbookExport, MobileJsonExport } from '../../../shared/mobile-export';

export function requireMobileVehicleImport(user: SessionUser) { if (!hasPermission(user, 'settings.write')) throw new MobileError('Không có quyền nhập hoặc thay danh sách xe.', 403, 'FORBIDDEN'); }
async function transaction<T>(user: SessionUser, write: boolean, task: (client: PoolClient) => Promise<T>, backupOnly = false) {
  if (backupOnly ? !hasPermission(user, 'contracts.read') : !hasPermission(user, 'settings.write')) throw new MobileError('Không có quyền thực hiện thao tác Excel xe.', 403, 'FORBIDDEN');
  return withMobileData(user, '', async () => {
    const client = await himotoPool.connect();
    try { await client.query(write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); await client.query("SET LOCAL statement_timeout='45s'"); const result = await task(client); await client.query('COMMIT'); return result; }
    catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error instanceof VehicleImportError) throw new MobileError(error.message, error.status, 'INVALID_VEHICLE_IMPORT');
      if (error && typeof error === 'object' && 'code' in error) {
        if (String(error.code) === '42703') throw new MobileError('Máy chủ chưa hỗ trợ đủ xác nhận Excel xe. Giữ mã lần gửi.', 503, 'MOBILE_SCHEMA_REQUIRED');
        if (['23505', '23503', '55P03', '40P01'].includes(String(error.code))) throw new MobileError('Dữ liệu xe đang thay đổi hoặc có liên kết. Đối chiếu mã rồi kiểm tra lại.', 409, 'IMPORT_CONFLICT');
      }
      throw error;
    } finally { client.release(); }
  });
}
async function stores(client: PoolClient) { return (await client.query('SELECT id,store_name AS name,code FROM himoto.stores ORDER BY store_name,id')).rows.map(r => ({ id: Number(r.id), name: String(r.name), code: String(r.code || '') })); }
function parsed(body: unknown) { try { return vehicleImportRequest(body); } catch (error) { if (error instanceof VehicleImportError) throw new MobileError(error.message, error.status, 'INVALID_VEHICLE_IMPORT'); throw error; } }
function batchId(value: string) { if (!isImportUuid(value)) throw new MobileError('Mã lần nhập xe chưa hợp lệ.'); return value; }
async function command(request: NextRequest, commit: boolean) {
  if (request.nextUrl.search) throw new MobileError('Thao tác nhập không dùng bộ lọc danh sách.');
  const body = await mobileBody(request, VEHICLE_IMPORT_BODY_LIMIT);
  if (Object.keys(body).some(k => !['rows', 'mode', 'revision', 'acceptWarnings', 'skipUnknownStores'].includes(k))) throw new MobileError('Thông tin nhập xe chưa hợp lệ.');
  return parsed({ ...body, commit });
}
export async function mobileVehicleImportOptions(user: SessionUser) { return transaction(user, false, async client => ({ stores: await stores(client), types: VEHICLE_TYPES, statuses: VEHICLE_STATUSES })); }
export async function mobileVehicleTemplate(user: SessionUser, request?: NextRequest): Promise<MobileWorkbookExport> {
  const input = request ? await command(request, false) : null;
  return transaction(user, false, async client => {
    const branches = await stores(client); let rows = input?.rows || [];
    if (input) { const review = await importDatabaseVehicles(client, input, user.id); rows = review.rows.filter(r => r.state !== 'skipped').map(r => ({ ...r, values: { ...r.values, store: r.storeId ? String(r.storeId) : r.values.store } })); }
    const bytes = await createVehicleTemplate(branches, rows); return { filename: input ? 'HIMOTO-xe-da-khop-cot.xlsx' : 'HIMOTO-mau-xe.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', contentBase64: Buffer.from(new Uint8Array(bytes)).toString('base64'), rowCount: rows.length };
  });
}
export async function readMobileVehicleWorkbook(user: SessionUser, request: NextRequest): Promise<MobileVehicleWorkbook> {
  requireMobileVehicleImport(user); if (request.nextUrl.search || request.headers.has('idempotency-key')) throw new MobileError('Đọc file không dùng mã ghi hoặc bộ lọc.');
  let name: string; try { name = decodeURIComponent(request.headers.get('x-file-name') || ''); } catch { throw new MobileError('Tên file chưa hợp lệ.'); }
  if (!name || name.length > 255 || !/\.xlsx$/i.test(name) || /[\\/]/.test(name) || Array.from(name).some(c => c.charCodeAt(0) < 32)) throw new MobileError('Chọn file Excel .xlsx tối đa 5 MB.');
  const reader = request.body?.getReader(); if (!reader) throw new MobileError('Chưa có file Excel.');
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > VEHICLE_EXCEL_MAX_BYTES) { await reader.cancel(); throw new MobileError('File xe vượt 5 MB.', 413, 'IMPORT_TOO_LARGE'); } chunks.push(next.value); } } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks); let data;
  try { data = await readVehicleExcel(new File([bytes], name)); } catch (error) { throw new MobileError((error as Error).message, 400, 'INVALID_IMPORT_FILE'); }
  const result = { ...data, filename: name, sha256: createHash('sha256').update(bytes).digest('hex') };
  if (!isMobileVehicleWorkbook(result)) throw new MobileError('Chưa đọc đủ các cột xe.', 503); return result;
}
export async function readMobileVehicleImport(user: SessionUser, request: NextRequest) {
  requireMobileVehicleImport(user); if (request.headers.has('idempotency-key')) throw new MobileError('Kiểm tra chưa dùng mã ghi.');
  const input = await command(request, false), result = await transaction(user, false, client => importDatabaseVehicles(client, input, user.id));
  if (!isMobileVehicleImportPreview(result)) throw new MobileError('Kết quả kiểm tra xe chưa hợp lệ.', 503); return result;
}
export async function readMobileVehicleReset(user: SessionUser) { return transaction(user, false, async client => { const result = await previewVehicleReset(client); if (!isMobileVehicleResetPreview(result)) throw new MobileError('Chưa kiểm tra đủ liên kết xe.', 503); return result; }); }

// Version + base-1001 counters fit the existing numeric receipt's 20 digits.
// resource_key is the actual backup UUID; resource_id anchors the actor.
function counters(existing: number, inserted: number, updated: number, skipped: number) {
  if (!Number.isSafeInteger(existing) || existing < 0 || existing > 2147483647 || [inserted, updated, skipped].some(n => !Number.isSafeInteger(n) || n < 0 || n > 1000)) throw new MobileError('Số lượng xác nhận xe chưa hợp lệ.', 503, 'INVALID_WRITE_RECEIPT');
  const value = ((BigInt(existing) * 1001n + BigInt(inserted)) * 1001n + BigInt(updated)) * 1001n + BigInt(skipped); return '1' + value.toString().padStart(19, '0');
}
function receipt(row: Record<string, unknown>, key: string, user: SessionUser, replayed = true): MobileVehicleImportReceipt {
  const version = String(row.resource_revision), operation = String(row.operation), mode = operation.split('.')[1]?.split(':')[0] as MobileVehicleImportMode;
  if (!isVehicleImportOperation(operation) || Number(row.resource_id) !== user.id || !isImportUuid(row.resource_key) || !/^1\d{19}$/.test(version)) throw new MobileError('Xác nhận nhập xe cần đối chiếu.', 409, 'INVALID_WRITE_RECEIPT');
  let value = BigInt(version.slice(1)); const skipped = Number(value % 1001n); value /= 1001n; const updated = Number(value % 1001n); value /= 1001n; const inserted = Number(value % 1001n), existing = Number(value / 1001n);
  const result = { key, operation, batchId: operation.slice(operation.indexOf(':') + 1), mode, actorId: user.id, backupId: row.resource_key, inserted, updated, skipped, existing, retained: mode === 'sync' ? existing - updated : 0, removed: mode === 'reset' ? existing : 0, total: inserted + updated + skipped, recordedAt: new Date(row.created_at instanceof Date ? row.created_at : String(row.created_at)).toISOString(), replayed };
  if (!isMobileVehicleImportReceipt(result)) throw new MobileError('Số lượng hoặc mã sao lưu chưa khớp xác nhận.', 409, 'INVALID_WRITE_RECEIPT'); return result;
}
async function write(client: PoolClient, user: SessionUser, key: string, operation: string, normalized: unknown, task: () => Promise<{ backupId: string; existing: number; inserted: number; updated: number; skipped: number }>) {
  const fingerprint = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  await client.query('INSERT INTO himoto.management_mobile_requests(user_id,request_id,operation,fingerprint) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,request_id) DO NOTHING', [user.id, key, operation, fingerprint]);
  const row = (await client.query('SELECT operation,fingerprint,resource_id,resource_key,resource_revision,created_at FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2 FOR UPDATE', [user.id, key])).rows[0];
  if (!row) throw new MobileError('Chưa xác nhận được mã lần nhập xe.', 503);
  if (String(row.operation).startsWith('cancelled:')) throw new MobileError('Mã lần nhập đã hủy. Đối chiếu trước khi nhập tiếp.', 409, 'REQUEST_CANCELLED');
  if (row.operation !== operation || row.fingerprint !== fingerprint) throw new MobileError('Mã nhập có nội dung khác. Giữ mã gốc để đối chiếu.', 409, 'REQUEST_KEY_REUSED');
  if (row.resource_key !== null) return receipt(row, key, user);
  if (row.resource_id !== null || row.resource_revision !== null) throw new MobileError('Xác nhận lần nhập chưa hợp lệ.', 409, 'INVALID_WRITE_RECEIPT');
  const result = await task(), revision = counters(result.existing, result.inserted, result.updated, result.skipped);
  const proof = receipt({ ...row, resource_id: user.id, resource_key: result.backupId, resource_revision: revision }, key, user, false);
  await client.query('UPDATE himoto.management_mobile_requests SET resource_id=$3,resource_key=$4,resource_revision=$5 WHERE user_id=$1 AND request_id=$2', [user.id, key, user.id, result.backupId, revision]); return proof;
}
export async function writeMobileVehicleImport(user: SessionUser, batch: string, request: NextRequest) {
  requireMobileVehicleImport(user); batchId(batch); const key = mobileRequestKey(request.headers.get('idempotency-key')), input = await command(request, true);
  return transaction(user, true, client => write(client, user, key, `vimport.${input.mode}:${batch}`, input, async () => {
    const result = await importDatabaseVehicles(client, input, user.id); if (!result.backupId || !result.committed || result.inserted + result.updated + result.skipped !== input.rows.length) throw new MobileError('Chưa xác nhận đủ xe sau nhập.', 503, 'INVALID_WRITE_RECEIPT');
    return { backupId: result.backupId, existing: result.existing, inserted: result.inserted, updated: result.updated, skipped: result.skipped };
  }));
}
export async function writeMobileVehicleReset(user: SessionUser, batch: string, request: NextRequest) {
  requireMobileVehicleImport(user); batchId(batch); const key = mobileRequestKey(request.headers.get('idempotency-key')), body = await mobileBody(request, 1024);
  if (request.nextUrl.search || Object.keys(body).some(k => !['revision', 'confirmation'].includes(k))) throw new MobileError('Yêu cầu xóa xe chưa hợp lệ.');
  return transaction(user, true, client => write(client, user, key, `vimport.reset:${batch}`, body, async () => { const result = await resetDatabaseVehicles(client, body, user.id); return { backupId: result.backupId, existing: result.removed, inserted: 0, updated: 0, skipped: 0 }; }));
}
export async function readMobileVehicleImportResult(user: SessionUser, key: string) { mobileRequestKey(key); return transaction(user, false, async client => {
  const row = (await client.query('SELECT operation,resource_id,resource_key,resource_revision,created_at FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2', [user.id, key])).rows[0];
  return { receipt: row && isVehicleImportOperation(row.operation) && row.resource_key !== null ? receipt(row, key, user) : null };
}); }
export async function resolveMobileVehicleImport(user: SessionUser, key: string, request: NextRequest): Promise<MobileVehicleImportResolution> {
  requireMobileVehicleImport(user); mobileRequestKey(key); const body = await mobileBody(request, 1024);
  if (Object.keys(body).some(k => k !== 'operation') || !isVehicleImportOperation(body.operation)) throw new MobileError('Loại thao tác xe cần đối chiếu chưa hợp lệ.'); const operation = body.operation;
  return transaction(user, true, async client => {
    const cancelled = `cancelled:${operation}`; await client.query('INSERT INTO himoto.management_mobile_requests(user_id,request_id,operation,fingerprint) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,request_id) DO NOTHING', [user.id, key, cancelled, createHash('sha256').update(cancelled).digest('hex')]);
    const row = (await client.query('SELECT operation,resource_id,resource_key,resource_revision,created_at FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2 FOR UPDATE', [user.id, key])).rows[0];
    if (!row || row.operation !== operation && row.operation !== cancelled) throw new MobileError('Mã lần nhập có thao tác khác. Giữ mã gốc.', 409, 'REQUEST_KEY_REUSED');
    if (row.operation === cancelled && row.resource_id === null && row.resource_key === null && row.resource_revision === null) return { key, operation, resourceKind: 'vehicle-import', status: 'cancelled', receipt: null };
    return { key, operation, resourceKind: 'vehicle-import', status: 'committed', receipt: receipt(row, key, user) };
  });
}
export async function mobileVehicleBackup(user: SessionUser, id: string): Promise<MobileJsonExport> {
  if (!isImportUuid(id)) throw new MobileError('Mã sao lưu chưa hợp lệ.');
  return transaction(user, false, async client => {
    const row = (await client.query('SELECT id,created_at,created_by,action,row_count,sha256,payload FROM himoto.vehicle_import_backups WHERE id=$1::uuid', [id])).rows[0];
    if (!row) throw new MobileError('Không tìm thấy bản sao lưu trong phạm vi.', 404, 'NOT_FOUND');
    if (!Array.isArray(row.payload) || row.payload.length !== Number(row.row_count) || vehicleSnapshotHash(row.payload) !== row.sha256) throw new MobileError('Bản sao lưu chưa khớp dấu kiểm. Chưa xuất file.', 503, 'BACKUP_INVALID');
    const content = JSON.stringify(row, null, 2); if (Buffer.byteLength(content, 'utf8') > 32 * 1024 * 1024) throw new MobileError('Bản sao lưu vượt dung lượng tải trên ứng dụng. Chưa xuất file bị cắt.', 413, 'EXPORT_TOO_LARGE');
    return { filename: `HIMOTO-xe-backup-${id}.json`, mimeType: 'application/json', content, rowCount: Number(row.row_count) };
  }, true);
}
