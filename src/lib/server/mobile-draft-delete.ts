import 'server-only';
import type { PoolClient } from 'pg';
import type { NextRequest } from 'next/server';
import type { SessionUser } from './management-session';
import { withMobileDraft, mobileDraftId, requireMobileDraft } from './mobile-drafts';
import { deleteContractDraft, DraftDeleteError } from './contract-draft-delete';
import { VEHICLE_ORDER_SQL } from './contract-classification';
import { MobileError } from './mobile-session';
import { mobileBody, mobileRequestKey, idempotentMobileWrite } from './mobile-writes';
import { isMobileDraftDeleteReview, isMobileDraftDeleteResult, type MobileDraftDeleteResult } from '../../../shared/mobile-draft-delete';
async function visible(client: PoolClient, id: number, includeDeleted = false) {
  const row = (await client.query(`SELECT o.id,o.draft_reference,o.order_status,o.contract_number,o.contract_issued_at,o.draft_payload #> '{management_composer,finalized}' AS finalized,o.xmin::text AS revision,
    EXISTS(SELECT 1 FROM himoto.transactions WHERE order_id=o.id) OR EXISTS(SELECT 1 FROM himoto.order_vehicle_details WHERE order_id=o.id) AS linked
    FROM himoto.orders o WHERE o.id=$1 ${includeDeleted ? '' : 'AND o.deleted_at IS NULL'} AND ${VEHICLE_ORDER_SQL}`, [id])).rows[0];
  if (!row) throw new MobileError('Không tìm thấy bản nháp trong cơ sở được phép.', 404, 'NOT_FOUND'); return row;
}
export async function readMobileDraftDelete(user: SessionUser, value: string) {
  const id = mobileDraftId(value);
  return withMobileDraft(user, '', async client => {
    const row = await visible(client, id), blockedReason = row.order_status !== 'draft' || row.contract_number || row.contract_issued_at || row.finalized ? 'Chỉ xóa được bản nháp chưa phát hành.' : row.linked ? 'Bản nháp đã có phiếu hoặc lịch sử xe, cần đối chiếu trước khi xóa.' : null;
    const review = { id, code: String(row.draft_reference || `#${id}`), revision: String(row.revision), canDelete: blockedReason === null, blockedReason };
    if (!isMobileDraftDeleteReview(review)) throw new MobileError('Bản nháp cần đối chiếu trên web.', 409, 'DATA_REVIEW_REQUIRED'); return review;
  });
}
async function result(client: PoolClient, user: SessionUser, key: string): Promise<MobileDraftDeleteResult | null> {
  const row = (await client.query('SELECT operation,resource_id,resource_revision FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2', [user.id, key])).rows[0];
  if (!row || !/^draft\.delete:[1-9]\d{0,14}$/.test(String(row.operation)) || row.resource_id == null) return null;
  const found = { key, operation: row.operation, receipt: { id: Number(row.resource_id), revision: String(row.resource_revision), replayed: true } };
  if (!isMobileDraftDeleteResult(found)) throw new MobileError('Kết quả xóa nháp cần đối chiếu.', 409, 'INVALID_WRITE_RECEIPT');
  // Deleted rows remain RLS scoped; the original receipt must stay recoverable.
  await visible(client, found.receipt.id, true); return found;
}
export async function readMobileDraftDeleteResult(user: SessionUser, key: string) { mobileRequestKey(key); return withMobileDraft(user, '', async client => ({ result: await result(client, user, key) })); }
export async function writeMobileDraftDelete(user: SessionUser, value: string, request: NextRequest) {
  requireMobileDraft(user); const id = mobileDraftId(value), key = mobileRequestKey(request.headers.get('idempotency-key')), body = await mobileBody(request, 1024);
  if (Object.keys(body).some(k => k !== 'revision') || typeof body.revision !== 'string' || !/^\d{1,20}$/.test(body.revision)) throw new MobileError('Tải lại bản nháp trước khi xóa.');
  return withMobileDraft(user, '', async client => {
    await visible(client, id, true);
    const receipt = await idempotentMobileWrite(client, user.id, key, `draft.delete:${id}`, { id, revision: body.revision }, async () => {
      try { await deleteContractDraft(client, id, body.revision, user.id, 'hidden'); }
      catch (error) { if (error instanceof DraftDeleteError) throw new MobileError(error.message, error.status, 'DRAFT_DELETE_CONFLICT'); throw error; }
      return { id, revision: String((await visible(client, id, true)).revision) };
    });
    const found = await result(client, user, key); if (!found) throw new MobileError('Chưa xác nhận được xóa nháp. Giữ mã để đối chiếu.', 503, 'INVALID_WRITE_RECEIPT'); return { ...found, receipt: { ...found.receipt, replayed: receipt.replayed } };
  }, true);
}
