import 'server-only';
import type { PoolClient } from 'pg';
import { CUSTOMER_IMPORT_COLUMNS, CUSTOMER_IMPORT_LIMIT, CustomerImportInput, CustomerImportResult, CustomerImportValues, validateCustomerImport } from '@/lib/management/customer-import';

export class CustomerImportError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const CUSTOMER_IMPORT_BODY_LIMIT = 2 * 1024 * 1024;

export function customerImportRequest(body: unknown): { rows: CustomerImportInput[]; commit: boolean; allowIncomplete: boolean } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CustomerImportError('Dữ liệu nhập không hợp lệ.');
  const { rows, commit, allowIncomplete = false } = body as Record<string, unknown>;
  if (typeof allowIncomplete !== 'boolean') throw new CustomerImportError('Lựa chọn nhập hồ sơ Chưa hoàn tất không hợp lệ.');
  if (!Array.isArray(rows) || !rows.length || rows.length > CUSTOMER_IMPORT_LIMIT || typeof commit !== 'boolean') throw new CustomerImportError(`Cần từ 1 đến ${CUSTOMER_IMPORT_LIMIT} khách hàng và chế độ nhập hợp lệ.`);
  const rowNumbers = new Set<number>();
  const inputs = rows.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new CustomerImportError('Dòng dữ liệu không hợp lệ.');
    const { rowNumber, values, errors } = raw as Record<string, unknown>;
    if (typeof rowNumber !== 'number' || !Number.isSafeInteger(rowNumber) || rowNumber < 2 || rowNumber > 10000 || rowNumbers.has(rowNumber) || !values || typeof values !== 'object' || Array.isArray(values)) throw new CustomerImportError('Số dòng hoặc các cột dữ liệu không hợp lệ.');
    rowNumbers.add(rowNumber);
    const fields = values as Record<string, unknown>;
    if (Object.keys(fields).some(key => !CUSTOMER_IMPORT_COLUMNS.some(column => column.key === key)) || CUSTOMER_IMPORT_COLUMNS.some(column => typeof fields[column.key] !== 'string' || (fields[column.key] as string).length > 10000)) throw new CustomerImportError('Các cột dữ liệu phải là văn bản theo mẫu khách hàng.');
    if (errors !== undefined && (!Array.isArray(errors) || errors.length > 30 || errors.some(error => typeof error !== 'string' || error.length > 300))) throw new CustomerImportError('Thông tin kiểm tra dòng không hợp lệ.');
    return { rowNumber, values: fields as CustomerImportValues, errors: errors as string[] | undefined };
  });
  return { rows: inputs, commit, allowIncomplete };
}

// Caller owns the transaction. A short table lock serializes the final duplicate
// check with other customer inserts/updates, including the existing single form.
export async function importDatabaseCustomers(client: Pick<PoolClient, 'query'>, inputs: CustomerImportInput[], commit: boolean, allowIncomplete = false): Promise<CustomerImportResult> {
  if (commit) {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query('LOCK TABLE himoto.customers IN SHARE ROW EXCLUSIVE MODE');
  }
  const branches = await client.query(`SELECT id, store_name AS name, code FROM himoto.stores${commit ? ' FOR KEY SHARE' : ''}`);
  const existing = await client.query('SELECT id, phone, id_card FROM himoto.customers');
  const result = validateCustomerImport(inputs, branches.rows, existing.rows, allowIncomplete);
  if (!commit) return result;
  // Commit only the exact eligible rows submitted after preview. A newly
  // introduced duplicate invalidates this batch so the user can review again.
  if (result.invalid || result.duplicate) throw new CustomerImportError('Dữ liệu đã thay đổi hoặc còn dòng lỗi / trùng. Nhấn Kiểm tra lại trước khi nhập.', 409);
  const parameters: unknown[] = [];
  const tuples = result.rows.map(row => {
    const { values, store_id: storeId } = row;
    const status = values.status === 'blacklist' ? 2 : values.status === 'draft' ? 0 : 1;
    const warning = values.warning_note || (values.status === 'blacklist' ? 'Blacklist' : null);
    const start = parameters.length;
    parameters.push(values.name, values.phone, values.email || null, values.address || null, values.id_card || null, status, storeId, warning);
    return `(${Array.from({ length: 8 }, (_, i) => `$${start + i + 1}`).join(', ')}, now(), now())`;
  });
  const inserted = await client.query(`INSERT INTO himoto.customers (name, phone, email, address, id_card, status, store_id, warning, created_at, updated_at)
    VALUES ${tuples.join(', ')} RETURNING id`, parameters);
  if (inserted.rowCount !== result.valid) throw new CustomerImportError('Không nhập đủ khách hàng. Đã hủy toàn bộ lần nhập.', 500);
  return { ...result, imported: inserted.rowCount, committed: true };
}
