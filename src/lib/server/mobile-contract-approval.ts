import 'server-only';
import type { NextRequest } from 'next/server';
import type { PoolClient } from 'pg';
import { hasPermission } from '@/lib/management/permissions';
import { canApproveOwnershipContract, isOwnershipApprovalContract } from '@/lib/management/contract-approval';
import type { MobileContractApprovalContext, MobileContractApprovalResult } from '../../../shared/mobile-contract-approval';
import { isMobileContractApprovalResult } from '../../../shared/mobile-contract-approval';
import { approveIssuedContract, readContractApproval, ContractApprovalError } from './contract-approval';
import { EFFECTIVE_RENTAL_TYPE_SQL, VEHICLE_ORDER_SQL } from './contract-classification';
import { withMobileData } from './mobile-context';
import { himotoPool } from './himoto-database';
import type { SessionUser } from './management-session';
import { MobileError } from './mobile-session';
import { idempotentMobileWrite, mobileBody, mobileRequestKey } from './mobile-writes';
import { mobileContractId } from './mobile-contracts';

function requireApproval(user: SessionUser, write = false) {
  if (!hasPermission(user, 'contracts.read') || write && !canApproveOwnershipContract(user))
    throw new MobileError('Tài khoản không có quyền duyệt hợp đồng sở hữu.', 403, 'FORBIDDEN');
}
async function transaction<T>(user: SessionUser, write: boolean, task: (client: PoolClient) => Promise<T>) {
  requireApproval(user, write);
  return withMobileData(user, '', async () => {
    const client = await himotoPool.connect();
    try {
      await client.query(write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout='20s';SET LOCAL lock_timeout='5s'");
      const result = await task(client); await client.query('COMMIT'); return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error instanceof ContractApprovalError) throw new MobileError(error.message, error.status, error.status === 409 ? 'CONTRACT_CHANGED' : 'INVALID_APPROVAL');
      throw error;
    } finally { client.release(); }
  });
}
async function context(client: PoolClient, user: SessionUser, id: number): Promise<MobileContractApprovalContext> {
    const row = (await client.query(`SELECT s.kind AS store_kind,s.store_name,${EFFECTIVE_RENTAL_TYPE_SQL} AS rental_type
      FROM himoto.orders o LEFT JOIN himoto.stores s ON s.id=o.store_id WHERE o.id=$1 AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}`, [id])).rows[0];
    if (!row) throw new MobileError('Không tìm thấy hợp đồng trong phạm vi tài khoản.', 404, 'NOT_FOUND');
    return { id, approval: isOwnershipApprovalContract(row) ? await readContractApproval(client, id, user) : null };
}
export async function readMobileContractApproval(user: SessionUser, value: string): Promise<MobileContractApprovalContext> {
  const id = mobileContractId(value);
  return transaction(user, false, client => context(client, user, id));
}
async function result(client: PoolClient, user: SessionUser, key: string): Promise<MobileContractApprovalResult | null> {
  const row = (await client.query(`SELECT operation,resource_id,resource_revision FROM himoto.management_mobile_requests
    WHERE user_id=$1 AND request_id=$2`, [user.id, key])).rows[0];
  if (!row || !/^contract\.approve:[1-9]\d{0,14}$/.test(String(row.operation)) || row.resource_id == null) return null;
  const id = Number(row.resource_id);
  if (row.operation !== `contract.approve:${id}`) throw new MobileError('Kết quả duyệt cần đối chiếu.', 409, 'INVALID_WRITE_RECEIPT');
  const saved = { key, operation: row.operation, receipt: { id, revision: String(row.resource_revision), replayed: true }, approval: (await context(client, user, id)).approval };
  if (!isMobileContractApprovalResult(saved)) throw new MobileError('Kết quả duyệt cần đối chiếu.', 409, 'INVALID_WRITE_RECEIPT');
  return saved;
}
export async function readMobileContractApprovalResult(user: SessionUser, key: string) {
  requireApproval(user, true); mobileRequestKey(key);
  return transaction(user, false, async client => ({ result: await result(client, user, key) }));
}
export async function writeMobileContractApproval(user: SessionUser, value: string, request: NextRequest): Promise<MobileContractApprovalResult> {
  requireApproval(user, true);
  const id = mobileContractId(value), key = mobileRequestKey(request.headers.get('idempotency-key')), body = await mobileBody(request, 1024);
  if (Object.keys(body).some(name => name !== 'revision') || typeof body.revision !== 'string' || !/^[1-9]\d{0,19}$/.test(body.revision))
    throw new MobileError('Phiên bản hợp đồng chưa hợp lệ.', 400, 'INVALID_APPROVAL');
  return transaction(user, true, async client => {
    // Replay still checks the actor's current scope and the web eligibility rules.
    await readContractApproval(client, id, user);
    const receipt = await idempotentMobileWrite(client, user.id, key, `contract.approve:${id}`, { id, revision: body.revision }, async () => {
      const approved = await approveIssuedContract(client, id, user, body);
      return { id, revision: approved.revision };
    });
    const found = await result(client, user, key);
    if (!found) throw new MobileError('Chưa xác nhận được kết quả duyệt. Giữ mã để đối chiếu.', 503, 'INVALID_WRITE_RECEIPT');
    return { ...found, receipt: { ...found.receipt, replayed: receipt.replayed } };
  });
}
