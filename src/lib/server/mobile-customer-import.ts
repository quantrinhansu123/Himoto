import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import type { PoolClient } from 'pg';
import { readCustomerExcel, createCustomerTemplate } from '@/lib/management/customer-excel';
import { CUSTOMER_EXCEL_MAX_BYTES } from '@/lib/management/customer-import';
import { hasPermission,isAdminAccount } from '@/lib/management/permissions';
import { customerImportRequest, importDatabaseCustomers, CustomerImportError, CUSTOMER_IMPORT_BODY_LIMIT } from './customer-import';
import { MobileError } from './mobile-session';
import { mobileBody, mobileRequestKey, idempotentMobileWrite } from './mobile-writes';
import { withMobileData } from './mobile-context';
import { himotoPool } from './himoto-database';
import type { SessionUser } from './management-session';
import { isImportUuid, isMobileCustomerImportPreview, isMobileImportReceipt, type MobileCustomerImportPreview, type MobileImportReceipt } from '../../../shared/mobile-customer-import';
import type { MobileWorkbookExport } from '../../../shared/mobile-export';

export function requireMobileCustomerImport(user: SessionUser) { if (!hasPermission(user, 'settings.write')) throw new MobileError('Tài khoản chưa được cấp quyền nhập dữ liệu từ Excel.', 403, 'FORBIDDEN'); }
async function transaction<T>(user: SessionUser, write: boolean, task: (client: PoolClient) => Promise<T>) {
  requireMobileCustomerImport(user);
  return withMobileData(user, '', async () => {
    const client = await himotoPool.connect();
    try {
      await client.query(write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); await client.query("SET LOCAL statement_timeout='30s'"); await client.query("SET LOCAL lock_timeout='5s'");
      const value = await task(client); await client.query('COMMIT'); return value;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error instanceof CustomerImportError) throw new MobileError(error.message, error.status, 'INVALID_CUSTOMER_IMPORT');
      if (error && typeof error === 'object' && 'code' in error && ['23505', '23503', '55P03', '40P01'].includes(String(error.code))) throw new MobileError('Dữ liệu vừa thay đổi hoặc có xung đột. Kiểm tra lại file trước khi nhập.', 409, 'IMPORT_CONFLICT');
      throw error;
    } finally { client.release(); }
  });
}
function batchId(value: unknown) { if (!isImportUuid(value)) throw new MobileError('Mã lần nhập chưa hợp lệ.'); return value; }
function keys(body: Record<string, unknown>, allowed: string[]) { if (Object.keys(body).some(k => !allowed.includes(k))) throw new MobileError('Thông tin nhập khách hàng chưa hợp lệ.'); }
function parse(body: unknown) { try { return customerImportRequest(body); } catch (error) { if (error instanceof CustomerImportError) throw new MobileError(error.message, error.status, 'INVALID_CUSTOMER_IMPORT'); throw error; } }
export async function mobileCustomerImportTemplate(user: SessionUser): Promise<MobileWorkbookExport> {
  const stores = await transaction(user, false, async client => (await client.query('SELECT id,store_name AS name,code FROM himoto.stores ORDER BY store_name,id')).rows.map(r => ({ id: Number(r.id), name: String(r.name), code: String(r.code || '') })));
  const buffer = await createCustomerTemplate(stores); return { filename: 'HIMOTO-mau-khach-hang.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', contentBase64: Buffer.from(new Uint8Array(buffer)).toString('base64'), rowCount: 0 };
}
export async function readMobileCustomerImport(user: SessionUser, request: NextRequest): Promise<MobileCustomerImportPreview> {
  requireMobileCustomerImport(user);
  if (request.nextUrl.search || request.headers.has('idempotency-key')) throw new MobileError('Kiểm tra file không dùng mã ghi hoặc bộ lọc URL.');
  let rows, filename: string, sha256: string, batch: string, allowIncomplete: boolean;
  if (request.headers.get('content-type')?.split(';')[0] === 'application/json') {
    const body = await mobileBody(request, CUSTOMER_IMPORT_BODY_LIMIT); keys(body, ['rows', 'filename', 'sha256', 'batchId', 'allowIncomplete']);
    if (typeof body.filename !== 'string' || body.filename.length > 255 || !/\.xlsx$/i.test(body.filename) || typeof body.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(body.sha256)) throw new MobileError('Tải lại file Excel trước khi kiểm tra.');
    ({ rows, allowIncomplete } = parse({ rows: body.rows, allowIncomplete: body.allowIncomplete, commit: false })); filename = body.filename; sha256 = body.sha256; batch = batchId(body.batchId);
  } else {
    let name: string; try { name = decodeURIComponent(request.headers.get('x-file-name') || ''); } catch { throw new MobileError('Tên file chưa hợp lệ.'); }
    if (!name || name.length > 255 || (Array.from(name).some(c => c.charCodeAt(0) < 32) || /[\\/]/.test(name)) || !/\.xlsx$/i.test(name) || !['0', '1'].includes(request.headers.get('x-allow-incomplete') || '')) throw new MobileError('Chọn file .xlsx và chế độ nhập trước khi kiểm tra.');
    if (request.nextUrl.search || request.headers.has('idempotency-key') || Number(request.headers.get('content-length') || 0) > CUSTOMER_EXCEL_MAX_BYTES) throw new MobileError('File không hợp lệ hoặc vượt 5 MB.', 413, 'IMPORT_TOO_LARGE');
    const reader = request.body?.getReader(); if (!reader) throw new MobileError('Chưa có dữ liệu file.');
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > CUSTOMER_EXCEL_MAX_BYTES) { await reader.cancel(); throw new MobileError('File vượt 5 MB.', 413, 'IMPORT_TOO_LARGE'); } chunks.push(part.value); } } finally { reader.releaseLock(); }
    const data = Buffer.concat(chunks);
    try { rows = await readCustomerExcel(new File([data], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); }
    catch (error) { throw new MobileError((error as Error).message, 400, 'INVALID_IMPORT_FILE'); }
    allowIncomplete = request.headers.get('x-allow-incomplete') === '1'; ({ rows } = parse({ rows, allowIncomplete, commit: false }));
    filename = name; sha256 = createHash('sha256').update(data).digest('hex'); batch = randomUUID();
  }
  const result = await transaction(user, false, client => importDatabaseCustomers(client, rows, false, allowIncomplete));
  const preview = { batchId: batch, filename, sha256, allowIncomplete, sourceRows: rows, result };
  if (!isMobileCustomerImportPreview(preview) || Buffer.byteLength(JSON.stringify(preview), 'utf8') > 6 * 1024 * 1024) throw new MobileError('Dữ liệu kiểm tra quá lớn; chia file thành phần nhỏ hơn.', 413, 'IMPORT_TOO_LARGE'); return preview;
}
export async function mobileImportReceipt(client: PoolClient, user: SessionUser, key: string): Promise<MobileImportReceipt | null> {
  const row = (await client.query('SELECT operation,resource_id,resource_revision,created_at FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2', [user.id, key])).rows[0];
  if (!row || !/^import\.(customers|cstores|contracts):/.test(String(row.operation)) || row.resource_id == null) return null;
  const operation = String(row.operation), kind = operation.startsWith('import.contracts:') ? 'contracts' as const : operation.startsWith('import.customers:') ? 'customers' as const : 'customer_stores' as const;
  if(kind==='contracts'&&!isAdminAccount(user))throw new MobileError('Chỉ quản trị viên được xem lần nhập hợp đồng.',403,'FORBIDDEN');
  const receipt = { key, operation, batchId: operation.slice(operation.indexOf(':') + 1), kind, actorId: Number(row.resource_id), count: Number(row.resource_revision) - 1, recordedAt: new Date(row.created_at).toISOString(), replayed: true };
  if (!isMobileImportReceipt(receipt) || receipt.actorId !== user.id) throw new MobileError('Kết quả nhập cần đối chiếu. Giữ mã lần gửi.', 409, 'INVALID_WRITE_RECEIPT'); return receipt;
}
export async function readMobileImportResult(user: SessionUser, key: string) { mobileRequestKey(key); return transaction(user, false, async client => ({ receipt: await mobileImportReceipt(client, user, key) })); }
export async function writeMobileCustomerImport(user: SessionUser, value: string, request: NextRequest): Promise<MobileImportReceipt> {
  requireMobileCustomerImport(user); const batch = batchId(value), key = mobileRequestKey(request.headers.get('idempotency-key')), body = await mobileBody(request, CUSTOMER_IMPORT_BODY_LIMIT); keys(body, ['rows', 'allowIncomplete']);
  const parsed = parse({ ...body, commit: true });
  return transaction(user, true, async client => {
    const saved = await idempotentMobileWrite(client, user.id, key, `import.customers:${batch}`, { batch, rows: parsed.rows, allowIncomplete: parsed.allowIncomplete }, async () => {
      const result = await importDatabaseCustomers(client, parsed.rows, true, parsed.allowIncomplete);
      // Batch receipt anchors the actual actor. Counter+1 supports zero-change
      // batches; this field is a batch counter, never an order/record revision.
      return { id: user.id, revision: String(result.imported + 1) };
    });
    const receipt = await mobileImportReceipt(client, user, key); if (!receipt || receipt.kind !== 'customers' || saved.id !== receipt.actorId) throw new MobileError('Chưa xác nhận được kết quả nhập. Giữ mã lần gửi.', 503, 'INVALID_WRITE_RECEIPT'); return { ...receipt, replayed: saved.replayed };
  });
}
