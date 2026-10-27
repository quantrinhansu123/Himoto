import 'server-only';
import type { PoolClient } from 'pg';
import { VEHICLE_ORDER_SQL } from './contract-classification';

const OPEN_STATUSES = ['renting', 'overdue', 'wait_payment', 'pending', 'deposit_contract'];

export class ReservationDeleteError extends Error { constructor(message: string, public status = 400) { super(message); } }

/** Soft-delete a deposit hold. Caller owns the transaction. Receipts stay in the cashbook. */
export async function deleteDepositContract(db: Pick<PoolClient, 'query'>, id: number, revision: unknown, actorId: number) {
  if (!Number.isSafeInteger(id) || id <= 0 || typeof revision !== 'string' || !/^\d{1,20}$/.test(revision)) {
    throw new ReservationDeleteError('Tải lại hợp đồng cọc trước khi xóa.');
  }
  const order = (await db.query(`SELECT id, order_status, contract_number, draft_reference,
      draft_payload #> '{management_composer,handover}' AS handover, xmin::text AS revision
    FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [id])).rows[0];
  if (!order) throw new ReservationDeleteError('Không tìm thấy hợp đồng cọc trong cơ sở được phép.', 404);
  if (order.order_status !== 'deposit_contract') {
    throw new ReservationDeleteError('Chỉ xóa được hợp đồng đang ở trạng thái Đã cọc, chờ nhận xe.', 409);
  }
  if (order.handover) throw new ReservationDeleteError('Hợp đồng cọc đã bàn giao. Dùng trả xe hoặc thao tác nghiệp vụ khác.', 409);
  if (order.revision !== revision) throw new ReservationDeleteError('Hợp đồng đã thay đổi. Làm mới danh sách rồi kiểm tra trước khi xóa.', 409);
  const handed = await db.query(`SELECT 1 FROM himoto.order_vehicle_details WHERE order_id=$1 AND deleted_at IS NULL AND completed_at IS NOT NULL LIMIT 1`, [id]);
  if (handed.rowCount) throw new ReservationDeleteError('Hợp đồng cọc đã có xe bàn giao. Không xóa được ở trạng thái này.', 409);

  const lines = await db.query(`UPDATE himoto.order_vehicle_details SET deleted_at=now(), updated_at=now()
    WHERE order_id=$1 AND deleted_at IS NULL RETURNING vehicle_id`, [id]);
  await db.query(`UPDATE himoto.orders SET deleted_at=now(), updated_at=now(),
    draft_payload=jsonb_set(COALESCE(draft_payload::jsonb,'{}'::jsonb),'{management_composer}',
      COALESCE(draft_payload::jsonb->'management_composer','{}'::jsonb) ||
      jsonb_build_object('deleted_reservation',jsonb_build_object(
        'actor_id',$2::bigint,'at',now(),'code',COALESCE(NULLIF($3::text,''),NULLIF($4::text,''),'#'||id::text))))
    WHERE id=$1`, [id, actorId, order.contract_number, order.draft_reference]);

  const released = [...new Set(lines.rows.filter(row => row.vehicle_id != null).map(row => Number(row.vehicle_id)))];
  if (released.length) {
    await db.query(`UPDATE himoto.vehicles v SET status='ready', updated_at=now()
      WHERE v.id = ANY($1::bigint[]) AND v.status='using' AND NOT EXISTS (
        SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
        WHERE d.vehicle_id=v.id AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL
          AND ${VEHICLE_ORDER_SQL} AND o.order_status = ANY($2::text[]))`, [released, OPEN_STATUSES]);
  }
}
