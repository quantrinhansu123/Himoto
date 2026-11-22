import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { NextRequest } from 'next/server';
import { canRecordContractPayment, hasPermission } from '@/lib/management/permissions';
import type { DataAccess } from './access-context';
import { ContractPaymentError } from './contract-payments';
import { parseDepositRefundDecision, readDepositRefundSubmission } from './deposit-refund-input';
import {
  decideDepositRefund, listDepositRefundRequests, readDepositRefundEvidence, readDepositRefundRequest,
  readDepositRefundState, refundItemId, refundRequestId, submitDepositRefund,
} from './deposit-refunds';
import { himotoPool } from './himoto-database';
import type { SessionUser } from './management-session';
import { withMobileData } from './mobile-context';
import { mobileFailure } from './mobile-response';
import { MobileError } from './mobile-session';
import { idempotentMobileWrite, mobileBody, mobileRequestKey } from './mobile-writes';

type Actor = Omit<DataAccess, 'operation'>;

function requireRefundAccess(user: SessionUser, kind: 'read' | 'submit' | 'review') {
  const canReturn = hasPermission(user, 'contracts.read') && hasPermission(user, 'contracts.return');
  const canReview = canRecordContractPayment(user);
  const allowed = kind === 'read' ? canReturn || canReview : kind === 'submit' ? canReturn : canReview;
  if (!allowed) throw new MobileError('Tài khoản chưa có quyền xử lý hoàn cọc.', 403, 'FORBIDDEN');
}

function refundData<T>(user: SessionUser, write: boolean, run: (db: PoolClient, actor: Actor) => Promise<T>) {
  const actor = { ...user, store_id: user.store_id ?? null, scope_all: user.scope_all === true };
  return withMobileData(user, '', async () => {
    const client = await himotoPool.connect();
    try {
      await client.query(write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='20s'");
      const data = await run(client, actor);
      await client.query('COMMIT');
      return data;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });
}

export function mobileRefundFailure(error: unknown) {
  if (error instanceof ContractPaymentError) {
    const code = error.status === 409 ? 'REFUND_CONFLICT' : error.status === 404 ? 'NOT_FOUND'
      : error.status === 403 ? 'FORBIDDEN' : 'INVALID_REFUND';
    return mobileFailure(new MobileError(error.message, error.status, code));
  }
  return mobileFailure(error);
}

export function mobileDepositRefundState(user: SessionUser, id: string, item: string) {
  requireRefundAccess(user, 'read');
  const orderId = refundItemId(id), itemId = refundItemId(item);
  return refundData(user, false, (db, actor) => readDepositRefundState(db, actor, itemId, orderId));
}

export async function saveMobileDepositRefund(user: SessionUser, id: string, item: string, request: NextRequest) {
  requireRefundAccess(user, 'submit');
  const orderId = refundItemId(id), itemId = refundItemId(item);
  const key = mobileRequestKey(request.headers.get('idempotency-key'));
  const input = await readDepositRefundSubmission(request);
  if (input.id !== key || input.item_id !== itemId) {
    throw new MobileError('Thông tin hoàn cọc chưa khớp lượt trả hoặc mã yêu cầu.', 400, 'INVALID_REFUND');
  }
  const { evidence, ...fields } = input;
  const evidenceHash = createHash('sha256').update(evidence).digest('hex');
  return refundData(user, true, async (db, actor) => {
    await idempotentMobileWrite(db, user.id, key, `return.refund:${orderId}`, { ...fields, evidenceHash }, async () => {
      await submitDepositRefund(db, actor, input, orderId);
      return { id: orderId, revision: '1' };
    });
    const saved = await readDepositRefundRequest(db, actor, key);
    if (saved?.order_id !== orderId || saved.item_id !== itemId || saved.actor_id !== user.id) {
      throw new MobileError('Chưa đối chiếu được yêu cầu hoàn cọc. Giữ mã để kiểm tra lại.', 409, 'INVALID_WRITE_RECEIPT');
    }
    return saved;
  });
}

export function mobileDepositRefundQueue(user: SessionUser, params: URLSearchParams) {
  requireRefundAccess(user, 'review');
  const page = Number(params.get('page') ?? '1');
  if ([...params.keys()].some(key => key !== 'page' || params.getAll(key).length > 1)
      || !Number.isSafeInteger(page) || page < 1 || page > 10_000) {
    throw new MobileError('Trang chờ duyệt không hợp lệ.');
  }
  return refundData(user, false, (db, actor) => listDepositRefundRequests(db, actor, page));
}

export function mobileDepositRefundRequest(user: SessionUser, rawId: string, params: URLSearchParams) {
  requireRefundAccess(user, 'read');
  const id = refundRequestId(rawId);
  if (![...params].every(([key, value]) => key === 'evidence' && value === '1' && params.getAll(key).length === 1)) {
    throw new MobileError('Mục tra cứu hoàn cọc không hợp lệ.');
  }
  return refundData(user, false, async (db, actor) => {
    if (params.has('evidence')) return { evidence: await readDepositRefundEvidence(db, actor, id) };
    const request = await readDepositRefundRequest(db, actor, id);
    if (!request) throw new MobileError('Không tìm thấy yêu cầu hoàn cọc trong phạm vi tài khoản.', 404, 'NOT_FOUND');
    return { request };
  });
}

export async function decideMobileDepositRefund(user: SessionUser, rawId: string, request: NextRequest) {
  requireRefundAccess(user, 'review');
  const id = refundRequestId(rawId);
  const input = await mobileBody(request, 4096);
  if (Object.keys(input).some(key => key !== 'decision' && key !== 'note')) throw new MobileError('Thông tin duyệt hoàn cọc không hợp lệ.');
  const { decision, note } = parseDepositRefundDecision(input);
  return refundData(user, true, (db, actor) => decideDepositRefund(db, actor, id, decision, note));
}
