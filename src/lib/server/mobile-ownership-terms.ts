import 'server-only';
import type { PoolClient } from 'pg';
import type { NextRequest } from 'next/server';
import { canEditOwnershipTerms } from '@/lib/management/ownership-terms';
import { hasPermission } from '@/lib/management/permissions';
import { readOwnershipTerms, updateOwnershipTerms, parseOwnershipTerms, OwnershipTermsError } from './ownership-terms';
import { VEHICLE_ORDER_SQL } from './contract-classification';
import { mobileContractId } from './mobile-contracts';
import { withMobileData } from './mobile-context';
import { himotoPool } from './himoto-database';
import type { SessionUser } from './management-session';
import { MobileError } from './mobile-session';
import { mobileBody, mobileRequestKey, idempotentMobileWrite } from './mobile-writes';
import { isMobileOwnershipTerms, isMobileOwnershipTermsResult, type MobileOwnershipTerms, type MobileOwnershipTermsResult } from '../../../shared/mobile-ownership-terms';

export function requireMobileOwnershipTerms(user: SessionUser, write = false) {
  if (!hasPermission(user, 'contracts.read') || write && !canEditOwnershipTerms(user)) throw new MobileError('Tài khoản chưa được cấp quyền sửa thời hạn thuê sở hữu.', 403, 'FORBIDDEN');
}
async function transaction<T>(user: SessionUser, write: boolean, task: (client: PoolClient) => Promise<T>) {
  requireMobileOwnershipTerms(user, write);
  return withMobileData(user, '', async () => {
    const client = await himotoPool.connect();
    try {
      await client.query(write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout='25s'"); await client.query("SET LOCAL lock_timeout='5s'");
      const value = await task(client); await client.query('COMMIT'); return value;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error instanceof OwnershipTermsError) throw new MobileError(error.message, error.status, 'INVALID_RENTAL_TERMS');
      throw error;
    } finally { client.release(); }
  });
}
async function visible(client: PoolClient, id: number) {
  const row = (await client.query(`SELECT o.id FROM himoto.orders o WHERE o.id=$1 AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}`, [id])).rows[0];
  if (!row) throw new MobileError('Không tìm thấy hợp đồng trong phạm vi tài khoản.', 404, 'NOT_FOUND');
}
export async function readMobileOwnershipTerms(user: SessionUser, value: string): Promise<MobileOwnershipTerms> {
  const id = mobileContractId(value);
  return transaction(user, false, async client => {
    const state = await readOwnershipTerms(client, id, user);
    const profile = { id: state.id, code: state.code, revision: state.revision, status: state.status, term_months: state.term_months, daily_amount: state.daily_amount, can_edit: state.can_edit };
    if (!isMobileOwnershipTerms(profile)) throw new MobileError('Thời hạn / mức đóng sở hữu cần đối chiếu trên web.', 409, 'DATA_REVIEW_REQUIRED');
    return profile;
  });
}
async function result(client: PoolClient, user: SessionUser, key: string): Promise<MobileOwnershipTermsResult | null> {
  const row = (await client.query('SELECT operation,resource_id,resource_revision FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2', [user.id, key])).rows[0];
  if (!row || !/^contract\.ownership_terms:[1-9]\d{0,14}$/.test(String(row.operation)) || row.resource_id == null) return null;
  const found = { key, operation: row.operation, receipt: { id: Number(row.resource_id), revision: String(row.resource_revision), replayed: true } };
  if (!isMobileOwnershipTermsResult(found)) throw new MobileError('Kết quả sửa thời hạn sở hữu cần đối chiếu.', 409, 'INVALID_WRITE_RECEIPT');
  await visible(client, found.receipt.id); return found;
}
export async function readMobileOwnershipTermsResult(user: SessionUser, key: string) {
  mobileRequestKey(key); return transaction(user, false, async client => ({ result: await result(client, user, key) }));
}
export async function writeMobileOwnershipTerms(user: SessionUser, value: string, request: NextRequest): Promise<MobileOwnershipTermsResult> {
  requireMobileOwnershipTerms(user);
  const id = mobileContractId(value), key = mobileRequestKey(request.headers.get('idempotency-key')), body = await mobileBody(request, 16384);
  if ('request_id' in body) throw new MobileError('Mã lần sửa được cấp riêng trong ứng dụng.', 400, 'INVALID_RENTAL_TERMS');
  let input;
  try { input = parseOwnershipTerms({ ...body, request_id: key }); }
  catch (error) { if (error instanceof OwnershipTermsError) throw new MobileError(error.message, error.status, 'INVALID_RENTAL_TERMS'); throw error; }
  return transaction(user, true, async client => {
    await visible(client, id);
    const receipt = await idempotentMobileWrite(client, user.id, key, `contract.ownership_terms:${id}`, { id, input }, async () => {
      const saved = await updateOwnershipTerms(client, id, user, input); return { id, revision: saved.revision };
    });
    const found = await result(client, user, key);
    if (!found) throw new MobileError('Chưa xác nhận được lần sửa. Giữ mã để đối chiếu.', 503, 'INVALID_WRITE_RECEIPT');
    return { ...found, receipt: { ...found.receipt, replayed: receipt.replayed } };
  });
}
