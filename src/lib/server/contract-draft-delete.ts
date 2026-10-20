import 'server-only';
import type { PoolClient } from 'pg';

export class DraftDeleteError extends Error { constructor(message: string, public status = 400) { super(message); } }

/** The caller owns the transaction. Never release stock or change receipts when removing a draft. */
export async function deleteContractDraft(db: Pick<PoolClient, 'query'>, id: number, revision: unknown, actorId: number) {
  if (!Number.isSafeInteger(id) || id <= 0 || typeof revision !== 'string' || !/^\d{1,20}$/.test(revision)) {
    throw new DraftDeleteError('Tải lại bản nháp trước khi xóa.');
  }
  const order = (await db.query(`SELECT id, order_status, contract_number, contract_issued_at,
      draft_payload #> '{management_composer,finalized}' AS finalized, xmin::text AS revision
    FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [id])).rows[0];
  if (!order) throw new DraftDeleteError('Không tìm thấy bản nháp trong cơ sở được phép.', 404);
  if (order.order_status !== 'draft' || order.contract_number || order.contract_issued_at || order.finalized) {
    throw new DraftDeleteError('Chỉ xóa được bản nháp chưa phát hành. Hợp đồng này đã chuyển trạng thái.', 409);
  }
  if (order.revision !== revision) throw new DraftDeleteError('Bản nháp đã thay đổi. Làm mới danh sách rồi kiểm tra trước khi xóa.', 409);
  const linked = (await db.query(`SELECT EXISTS(SELECT 1 FROM himoto.transactions WHERE order_id=$1)
      OR EXISTS(SELECT 1 FROM himoto.order_vehicle_details WHERE order_id=$1) AS present`, [id])).rows[0];
  if (linked.present) throw new DraftDeleteError('Bản nháp đã có phiếu thu/chi hoặc lịch sử giao xe; cần đối chiếu trước khi xóa.', 409);
  await db.query(`UPDATE himoto.orders SET deleted_at=now(), updated_at=now(),
    draft_payload=jsonb_set(COALESCE(draft_payload::jsonb,'{}'::jsonb),'{management_composer}',
      COALESCE(draft_payload::jsonb->'management_composer','{}'::jsonb) ||
      jsonb_build_object('deleted_draft',jsonb_build_object('actor_id',$2::bigint,'at',now())))
    WHERE id=$1`, [id, actorId]);
}
