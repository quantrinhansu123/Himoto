import 'server-only';
import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import type { PoolClient } from 'pg';
import type { SessionUser } from './management-session';
import { requireMobileCustomerImport, mobileImportReceipt } from './mobile-customer-import';
import { withMobileData } from './mobile-context';
import { himotoPool } from './himoto-database';
import { MobileError } from './mobile-session';
import { mobileBody, mobileRequestKey, idempotentMobileWrite } from './mobile-writes';
import { CustomerImportError, CUSTOMER_IMPORT_BODY_LIMIT } from './customer-import';
import { customerStoreRequest, importCustomerStores } from './customer-store-import';
import { createCustomerStoreTemplate, readCustomerStoreExcel } from '@/lib/management/customer-excel';
import { prepareCustomerStoreInputs } from '@/lib/management/customer-store-batches';
import { CUSTOMER_EXCEL_MAX_BYTES } from '@/lib/management/customer-import';
import { isImportUuid, type MobileImportReceipt } from '../../../shared/mobile-customer-import';
import { isMobileStoreMatchFilePage, isMobileStoreMatchResult, type MobileStoreMatchFilePage } from '../../../shared/mobile-customer-store-import';
import type { MobileWorkbookExport } from '../../../shared/mobile-export';

async function transaction<T>(user: SessionUser, write: boolean, task: (client: PoolClient) => Promise<T>) {
  requireMobileCustomerImport(user);
  return withMobileData(user, '', async () => {
    const client = await himotoPool.connect();
    try { await client.query(write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); await client.query("SET LOCAL statement_timeout='30s'"); const result = await task(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK').catch(() => {}); if (error instanceof CustomerImportError) throw new MobileError(error.message, error.status, 'INVALID_STORE_MATCH'); throw error; }
    finally { client.release(); }
  });
}
export async function mobileStoreMatchTemplate(user: SessionUser): Promise<MobileWorkbookExport> {
  const stores = await transaction(user, false, async client => (await client.query('SELECT id,store_name AS name,code FROM himoto.stores ORDER BY store_name,id')).rows.map(r => ({ id: Number(r.id), name: String(r.name), code: String(r.code || '') })));
  const bytes = await createCustomerStoreTemplate(stores); return { filename: 'HIMOTO-mau-can-cuoc-co-so.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', contentBase64: Buffer.from(new Uint8Array(bytes)).toString('base64'), rowCount: 0 };
}
async function readStoreMatchInputs(user: SessionUser, request: NextRequest) {
  requireMobileCustomerImport(user);
  if (request.nextUrl.search || request.headers.has('idempotency-key')) throw new MobileError('Đọc file không dùng mã ghi hoặc bộ lọc.');
  const value = request.headers.get('x-row-offset') || '0'; if (!/^(0|[1-9]\d{0,6})$/.test(value) || Number(value) % 1000) throw new MobileError('Phần file chưa hợp lệ.');
  const offset = Number(value); let filename: string;
  try { filename = decodeURIComponent(request.headers.get('x-file-name') || ''); } catch { throw new MobileError('Tên file chưa hợp lệ.'); }
  if (!filename || filename.length > 255 || !/\.xlsx$/i.test(filename) || /[\\/]/.test(filename) || Array.from(filename).some(c => c.charCodeAt(0) < 32)) throw new MobileError('Chọn file Excel .xlsx.');
  const reader = request.body?.getReader(); if (!reader) throw new MobileError('Chưa có file Excel.');
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > CUSTOMER_EXCEL_MAX_BYTES) { await reader.cancel(); throw new MobileError('File vượt 5 MB.', 413, 'IMPORT_TOO_LARGE'); } chunks.push(part.value); } } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks), sha256 = createHash('sha256').update(bytes).digest('hex');
  const expected = request.headers.get('x-file-sha256'); if (expected && expected !== sha256) throw new MobileError('File đã thay đổi. Chọn lại file trước khi kiểm tra.', 409, 'FILE_CHANGED');
  let inputs;
  try { inputs = prepareCustomerStoreInputs(await readCustomerStoreExcel(new File([bytes], filename))); } catch (error) { throw new MobileError((error as Error).message, 400, 'INVALID_IMPORT_FILE'); }
  return { filename, sha256, offset, inputs };
}
function filePart(file: Awaited<ReturnType<typeof readStoreMatchInputs>>, offset: number): MobileStoreMatchFilePage {
  const { filename, sha256, inputs } = file;
  const result = { filename, sha256, total: inputs.length, offset, nextOffset: offset + 1000 < inputs.length ? offset + 1000 : null, inputs: inputs.slice(offset, offset + 1000) };
  if (!isMobileStoreMatchFilePage(result)) throw new MobileError('Phần file nằm ngoài dữ liệu. Chọn lại file.'); return result;
}
export async function readMobileStoreMatchFile(user: SessionUser, request: NextRequest): Promise<MobileStoreMatchFilePage> { const file = await readStoreMatchInputs(user, request); return filePart(file, file.offset); }
export async function streamMobileStoreMatchFile(user: SessionUser, request: NextRequest): Promise<Response> {
  const file = await readStoreMatchInputs(user, request); if (file.offset !== 0) throw new MobileError('Đọc luồng Excel từ phần đầu.');
  let offset = 0; const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) { const part = filePart(file, offset); controller.enqueue(encoder.encode(JSON.stringify(part) + '\n')); offset += part.inputs.length; if (offset === file.inputs.length) controller.close(); },
  }), { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Authorization' } });
}
async function command(request: NextRequest, commit: boolean) {
  const body = await mobileBody(request, CUSTOMER_IMPORT_BODY_LIMIT);
  if (request.nextUrl.search || Object.keys(body).some(k => !['rows', 'revision'].includes(k))) throw new MobileError('Dữ liệu khớp cơ sở chưa hợp lệ.');
  try { return customerStoreRequest({ ...body, commit }); } catch (error) { if (error instanceof CustomerImportError) throw new MobileError(error.message, error.status, 'INVALID_STORE_MATCH'); throw error; }
}
export async function readMobileStoreMatch(user: SessionUser, request: NextRequest) {
  requireMobileCustomerImport(user); if (request.headers.has('idempotency-key')) throw new MobileError('Kiểm tra chưa dùng mã ghi.');
  const input = await command(request, false), result = await transaction(user, false, client => importCustomerStores(client, input.rows, false));
  if (!isMobileStoreMatchResult(result)) throw new MobileError('Chưa đối chiếu đủ cơ sở khách hàng.', 503); return result;
}
export async function writeMobileStoreMatch(user: SessionUser, batch: string, request: NextRequest): Promise<MobileImportReceipt> {
  requireMobileCustomerImport(user); if (!isImportUuid(batch)) throw new MobileError('Mã phần nhập chưa hợp lệ.');
  const key = mobileRequestKey(request.headers.get('idempotency-key')), input = await command(request, true);
  return transaction(user, true, async client => {
    const saved = await idempotentMobileWrite(client, user.id, key, `import.cstores:${batch}`, { batch, rows: input.rows, revision: input.revision }, async () => {
      const result = await importCustomerStores(client, input.rows, true, input.revision); return { id: user.id, revision: String(result.updated + 1) };
    });
    const receipt = await mobileImportReceipt(client, user, key); if (!receipt || receipt.kind !== 'customer_stores' || receipt.actorId !== saved.id) throw new MobileError('Giữ mã phần nhập để đối chiếu kết quả.', 503, 'INVALID_WRITE_RECEIPT'); return { ...receipt, replayed: saved.replayed };
  });
}
