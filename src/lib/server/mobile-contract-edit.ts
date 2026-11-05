import 'server-only';
import type { PoolClient } from 'pg';
import type { NextRequest } from 'next/server';
import { CUSTOMER_FIELDS, createContractDraft, emptyVehicle } from '@/lib/management/contract-document';
import { canEditIssuedContract } from '@/lib/management/contract-profile';
import { hasPermission } from '@/lib/management/permissions';
import { mapApiRow } from '@/lib/management/repository';
import { draftDocumentKeys } from '../../../shared/mobile-draft-validation';
import { isMobileContractEditProfile, isMobileContractEditResult, type MobileContractEditProfile, type MobileContractEditResult } from '../../../shared/mobile-contract-edit';
import { parseContractEdit, updateIssuedContract } from './contract-edit';
import { ContractProfileError } from './contract-profile';
import { CONTRACT_LIST_SQL } from './contract-drafts';
import { VEHICLE_ORDER_SQL } from './contract-classification';
import { contractVehicleDetailsSql } from './contract-vehicle-reads';
import { mobileDraftDocument } from './mobile-draft-shape';
import { mobileContractId } from './mobile-contracts';
import { withMobileData } from './mobile-context';
import { himotoPool } from './himoto-database';
import type { SessionUser } from './management-session';
import { MobileError } from './mobile-session';
import { idempotentMobileWrite, mobileBody, mobileRequestKey } from './mobile-writes';

function requireEdit(user: SessionUser) {
  if (!hasPermission(user, 'contracts.read') || !canEditIssuedContract(user)) throw new MobileError('Tài khoản chưa được cấp quyền sửa hợp đồng.', 403, 'FORBIDDEN');
}
async function transaction<T>(user: SessionUser, write: boolean, task: (client: PoolClient) => Promise<T>) {
  requireEdit(user);
  return withMobileData(user, '', async () => {
    const client = await himotoPool.connect();
    try {
      await client.query(write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout='20s';SET LOCAL lock_timeout='5s'");
      const value = await task(client); await client.query('COMMIT'); return value;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error instanceof ContractProfileError) throw new MobileError(error.message, error.status, 'INVALID_CONTRACT_EDIT');
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') throw new MobileError('Số hợp đồng đã được sử dụng. Kiểm tra số HĐ giấy trước khi lưu.', 409, 'CONTRACT_NUMBER_USED');
      throw error;
    } finally { client.release(); }
  });
}
async function visible(client: PoolClient, id: number) {
  const row = (await client.query(`SELECT o.id,o.order_status FROM himoto.orders o WHERE o.id=$1 AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}`, [id])).rows[0];
  if (!row) throw new MobileError('Không tìm thấy hợp đồng trong phạm vi tài khoản.', 404, 'NOT_FOUND');
  return row;
}
/** Whitelist transport fields, then apply the actual web permissive parser. */
export function parseMobileContractEdit(value: unknown) {
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const keys = (v: unknown, allowed: readonly string[]) => {
    if (!object(v) || Object.keys(v).some(k => !allowed.includes(k))) throw new MobileError('Biểu mẫu có trường chưa được hỗ trợ. Giữ nội dung và kiểm tra trên web.', 400, 'INVALID_CONTRACT_EDIT');
  };
  keys(value, ['draft', 'rental_type', 'status', 'notes', 'revision']);
  const body = value as Record<string, unknown>; keys(body.draft, draftDocumentKeys);
  const draft = body.draft as Record<string, unknown>;
  if (draft.vehicles !== undefined && draft.vehicles !== null && !Array.isArray(draft.vehicles)) throw new MobileError('Các dòng xe chưa hợp lệ.', 400, 'INVALID_CONTRACT_EDIT');
  if (draft.customer !== undefined) keys(draft.customer, [...CUSTOMER_FIELDS, 'relatives_json']);
  if (Array.isArray(draft.relatives)) for (const row of draft.relatives) keys(row, ['name', 'relationship', 'phone']);
  if (Array.isArray(draft.vehicles)) for (const row of draft.vehicles) keys(row, [...Object.keys(emptyVehicle()), 'stock_store_id', 'stock_store_name']);
  try { return parseContractEdit(value); }
  catch (error) {
    if (error instanceof ContractProfileError) throw new MobileError(error.message, error.status, 'INVALID_CONTRACT_EDIT');
    throw error;
  }
}
export async function readMobileContractEdit(user: SessionUser, value: string): Promise<MobileContractEditProfile> {
  const id = mobileContractId(value);
  return transaction(user, false, async client => {
    const current = await visible(client, id);
    if (current.order_status === 'draft') throw new MobileError('Hợp đồng đang là bản nháp. Mở màn soạn nháp để tiếp tục.', 409, 'DRAFT_CONFLICT');
    const raw = (await client.query(contractVehicleDetailsSql(`${CONTRACT_LIST_SQL} AND o.id=$1`), [id])).rows[0];
    if (!raw) throw new MobileError('Không tìm thấy hợp đồng.', 404, 'NOT_FOUND');
    const row = mapApiRow('contracts', { ...raw, status: current.order_status });
    const document = createContractDraft({ stores: [], staff: [], customers: [], contracts: [], vehicles: [] }, 'all', row);
    const profile = { id, code: row.code, revision: String(raw.draft_revision), input: {
      draft: mobileDraftDocument(document), rental_type: String(row.rental_type || 'daily'), status: String(current.order_status), notes: String(row.notes || ''), revision: String(raw.draft_revision),
    }, rentalPaid: raw.paid_amount == null ? null : Number(raw.paid_amount), depositPaid: raw.deposit_paid == null ? null : Number(raw.deposit_paid) };
    // Structural only: never apply draftErrors or issuance prerequisites to an issued editor.
    if (!isMobileContractEditProfile(profile) || Buffer.byteLength(JSON.stringify(profile), 'utf8') > 524288) throw new MobileError('Hồ sơ cần phiên bản ứng dụng mới hơn hoặc kiểm tra dữ liệu trên web.', 409, 'DATA_REVIEW_REQUIRED');
    return profile;
  });
}
async function result(client: PoolClient, user: SessionUser, key: string): Promise<MobileContractEditResult | null> {
  const row = (await client.query('SELECT operation,resource_id,resource_revision FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2', [user.id, key])).rows[0];
  if (!row || !/^contract\.edit:[1-9]\d{0,14}$/.test(String(row.operation)) || row.resource_id == null) return null;
  const value = { key, operation: row.operation, receipt: { id: Number(row.resource_id), revision: String(row.resource_revision), replayed: true } };
  if (!isMobileContractEditResult(value)) throw new MobileError('Kết quả sửa cần đối chiếu. Giữ mã lần lưu.', 409, 'INVALID_WRITE_RECEIPT');
  await visible(client, value.receipt.id); return value;
}
export async function readMobileContractEditResult(user: SessionUser, key: string) {
  mobileRequestKey(key); return transaction(user, false, async client => ({ result: await result(client, user, key) }));
}
export async function writeMobileContractEdit(user: SessionUser, value: string, request: NextRequest): Promise<MobileContractEditResult> {
  requireEdit(user);
  const id = mobileContractId(value), key = mobileRequestKey(request.headers.get('idempotency-key')), body = await mobileBody(request, 524288);
  parseMobileContractEdit(body);
  return transaction(user, true, async client => {
    await visible(client, id);
    // The web writer deliberately overwrites the latest locked row. Revision is
    // review metadata, not CAS. UUID still prevents duplicate audit/stock writes.
    const receipt = await idempotentMobileWrite(client, user.id, key, `contract.edit:${id}`, { id, body }, async () => {
      const saved = await updateIssuedContract(client, id, user.id, body); return { id, revision: saved.revision };
    });
    const found = await result(client, user, key);
    if (!found) throw new MobileError('Chưa xác nhận được lần sửa. Giữ mã để đối chiếu.', 503, 'INVALID_WRITE_RECEIPT');
    return { ...found, receipt: { ...found.receipt, replayed: receipt.replayed } };
  });
}
