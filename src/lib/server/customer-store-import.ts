import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { CUSTOMER_IMPORT_LIMIT } from '@/lib/management/customer-import';
import { CustomerStoreInput, CustomerStoreResult, matchCustomerStores } from '@/lib/management/customer-store-import';
import { CustomerImportError } from './customer-import';

export function customerStoreRequest(body: unknown): { rows: CustomerStoreInput[]; commit: boolean; revision: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CustomerImportError('Dữ liệu khớp cơ sở không hợp lệ.');
  const { rows, commit, revision = '' } = body as Record<string, unknown>;
  if (!Array.isArray(rows) || !rows.length || rows.length > CUSTOMER_IMPORT_LIMIT || typeof commit !== 'boolean') throw new CustomerImportError(`Cần từ 1 đến ${CUSTOMER_IMPORT_LIMIT} dòng và chế độ cập nhật hợp lệ.`);
  if (typeof revision !== 'string' || (commit && !/^[a-f0-9]{64}$/.test(revision))) throw new CustomerImportError('Cần kiểm tra file trước khi cập nhật cơ sở.');
  const rowNumbers = new Set<number>();
  const inputs = rows.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new CustomerImportError('Dòng dữ liệu không hợp lệ.');
    const { rowNumber, values, errors } = raw as Record<string, unknown>;
    if (typeof rowNumber !== 'number' || !Number.isSafeInteger(rowNumber) || rowNumber < 2 || rowNumber > 10000 || rowNumbers.has(rowNumber) || !values || typeof values !== 'object' || Array.isArray(values)) throw new CustomerImportError('Số dòng hoặc các cột dữ liệu không hợp lệ.');
    rowNumbers.add(rowNumber);
    const fields = values as Record<string, unknown>;
    if (Object.keys(fields).some(key => !['id_card', 'store'].includes(key)) || ['id_card', 'store'].some(key => typeof fields[key] !== 'string' || (fields[key] as string).length > 10000)) throw new CustomerImportError('Căn cước và cơ sở phải là văn bản theo mẫu.');
    if (errors !== undefined && (!Array.isArray(errors) || errors.length > 30 || errors.some(error => typeof error !== 'string' || error.length > 300))) throw new CustomerImportError('Thông tin kiểm tra dòng không hợp lệ.');
    return { rowNumber, values: fields as CustomerStoreInput['values'], errors: errors as string[] | undefined };
  });
  return { rows: inputs, commit, revision };
}

// Caller owns the transaction. Recheck the complete preview while customer
// writes and branch edits are locked, then change only customer store_id.
export async function importCustomerStores(client: Pick<PoolClient, 'query'>, inputs: CustomerStoreInput[], commit: boolean, expectedRevision = ''): Promise<CustomerStoreResult> {
  if (commit) {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query('LOCK TABLE himoto.customers IN SHARE ROW EXCLUSIVE MODE');
  }
  const branches = await client.query(`SELECT id, store_name AS name, code FROM himoto.stores ORDER BY id${commit ? ' FOR SHARE' : ''}`);
  const customers = await client.query('SELECT id, name, id_card, store_id FROM himoto.customers ORDER BY id');
  // PostgreSQL bigint IDs arrive as strings; use the same numeric IDs as the UI.
  const rows = matchCustomerStores(inputs, branches.rows.map(store => ({ ...store, id: Number(store.id) })), customers.rows.map(customer => ({ ...customer, id: Number(customer.id), store_id: customer.store_id == null ? null : Number(customer.store_id) })));
  const revision = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  const result: CustomerStoreResult = {
    rows, total: rows.length, ready: rows.filter(row => row.state === 'ready').length,
    unchanged: rows.filter(row => row.state === 'unchanged').length, invalid: rows.filter(row => row.state === 'invalid').length,
    updated: 0, committed: false, revision,
  };
  if (!commit) return result;
  if (revision !== expectedRevision) throw new CustomerImportError('Khách hàng, cơ sở hoặc file đã thay đổi. Nhấn Kiểm tra lại trước khi cập nhật.', 409);
  if (!result.ready) throw new CustomerImportError('Không có cơ sở khách hàng cần cập nhật.');
  const parameters: unknown[] = [];
  const tuples = rows.filter(row => row.state === 'ready').map(row => {
    const start = parameters.length;
    parameters.push(row.customer_id, row.previous_store_id, row.store_id);
    return `($${start + 1}::bigint, $${start + 2}::bigint, $${start + 3}::bigint)`;
  });
  const updated = await client.query(`UPDATE himoto.customers AS customer SET store_id = mapping.store_id, updated_at = now()
    FROM (VALUES ${tuples.join(', ')}) AS mapping(customer_id, previous_store_id, store_id)
    WHERE customer.id = mapping.customer_id AND customer.store_id IS NOT DISTINCT FROM mapping.previous_store_id
    RETURNING customer.id`, parameters);
  if (updated.rowCount !== result.ready) throw new CustomerImportError('Không cập nhật đủ khách hàng. Đã hủy toàn bộ lần cập nhật.', 409);
  return { ...result, updated: updated.rowCount, committed: true };
}
