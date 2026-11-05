import 'server-only';
import type { PoolClient } from 'pg';
import type { NextRequest } from 'next/server';
import { canEditIssuedContract } from '@/lib/management/contract-profile';
import { hasPermission } from '@/lib/management/permissions';
import { readRentalTerms, updateRentalTerms, parseRentalTerms, RentalTermsError } from './rental-terms';
import { VEHICLE_ORDER_SQL } from './contract-classification';
import { mobileContractId } from './mobile-contracts';
import { withMobileData } from './mobile-context';
import { himotoPool } from './himoto-database';
import type { SessionUser } from './management-session';
import { MobileError } from './mobile-session';
import { mobileBody, mobileRequestKey, idempotentMobileWrite } from './mobile-writes';
import { isMobileRentalTerms, isMobileRentalTermsResult, type MobileRentalTerms, type MobileRentalTermsResult } from '../../../shared/mobile-rental-terms';

export function requireMobileRentalTerms(user: SessionUser) {
  if (!hasPermission(user, 'contracts.read') || !canEditIssuedContract(user)) throw new MobileError('Tài khoản chưa được cấp quyền sửa tiền / ngày thuê.', 403, 'FORBIDDEN');
}
async function transaction<T>(user: SessionUser, write: boolean, task: (client: PoolClient) => Promise<T>) {
  requireMobileRentalTerms(user);
  return withMobileData(user, '', async () => {
    const client = await himotoPool.connect();
    try {
      await client.query(write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout='25s'"); await client.query("SET LOCAL lock_timeout='5s'");
      const value = await task(client); await client.query('COMMIT'); return value;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error instanceof RentalTermsError) throw new MobileError(error.message, error.status, 'INVALID_RENTAL_TERMS');
      throw error;
    } finally { client.release(); }
  });
}
async function visible(client: PoolClient, id: number) {
  const row = (await client.query(`SELECT o.id FROM himoto.orders o WHERE o.id=$1 AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}`, [id])).rows[0];
  if (!row) throw new MobileError('Không tìm thấy hợp đồng trong phạm vi tài khoản.', 404, 'NOT_FOUND');
}
export async function readMobileRentalTerms(user: SessionUser, value: string): Promise<MobileRentalTerms> {
  const id = mobileContractId(value);
  return transaction(user, false, async client => {
    const state = await readRentalTerms(client, id, user);
    const profile = { id, revision: state.revision, code: state.code, total_amount: state.total_amount, paid_amount: state.paid_amount,
      items: state.items.map(i => ({ id: i.id, revision: i.revision, vehicle_id: i.vehicle_id, license: i.license, start_at: i.start_at, end_at: i.end_at, unit_price: i.unit_price, completed_at: i.completed_at })) };
    if (!isMobileRentalTerms(profile)) throw new MobileError('Tiền / ngày thuê cần đối chiếu trên web.', 409, 'DATA_REVIEW_REQUIRED');
    return profile;
  });
}
async function result(client: PoolClient, user: SessionUser, key: string): Promise<MobileRentalTermsResult | null> {
  const row = (await client.query('SELECT operation,resource_id,resource_revision FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2', [user.id, key])).rows[0];
  if (!row || !/^contract\.terms:[1-9]\d{0,14}$/.test(String(row.operation)) || row.resource_id == null) return null;
  const found = { key, operation: row.operation, receipt: { id: Number(row.resource_id), revision: String(row.resource_revision), replayed: true } };
  if (!isMobileRentalTermsResult(found)) throw new MobileError('Kết quả sửa tiền / ngày thuê cần đối chiếu.', 409, 'INVALID_WRITE_RECEIPT');
  await visible(client, found.receipt.id); return found;
}
export async function readMobileRentalTermsResult(user: SessionUser, key: string) {
  mobileRequestKey(key); return transaction(user, false, async client => ({ result: await result(client, user, key) }));
}
export async function writeMobileRentalTerms(user: SessionUser, value: string, request: NextRequest): Promise<MobileRentalTermsResult> {
  requireMobileRentalTerms(user);
  const id = mobileContractId(value), key = mobileRequestKey(request.headers.get('idempotency-key')), body = await mobileBody(request, 16384);
  if ('request_id' in body) throw new MobileError('Mã lần sửa được cấp riêng trong ứng dụng.', 400, 'INVALID_RENTAL_TERMS');
  let input;
  try { input = parseRentalTerms({ ...body, request_id: key }); }
  catch (error) { if (error instanceof RentalTermsError) throw new MobileError(error.message, error.status, 'INVALID_RENTAL_TERMS'); throw error; }
  return transaction(user, true, async client => {
    await visible(client, id);
    const receipt = await idempotentMobileWrite(client, user.id, key, `contract.terms:${id}`, { id, input }, async () => {
      const saved = await updateRentalTerms(client, id, user, input); return { id, revision: saved.revision };
    });
    const found = await result(client, user, key);
    if (!found) throw new MobileError('Chưa xác nhận được lần sửa. Giữ mã để đối chiếu.', 503, 'INVALID_WRITE_RECEIPT');
    return { ...found, receipt: { ...found.receipt, replayed: receipt.replayed } };
  });
}
