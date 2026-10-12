import 'server-only';
import type { PoolClient } from 'pg';
import { ContractFinalizeError } from './contract-finalize';
import { readPaymentContext } from './contract-payments';

type Database = Pick<PoolClient, 'query'>;
export function parseHandoverInput(body: unknown): { revision: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ContractFinalizeError('Thông tin giao xe không hợp lệ.');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key=>key !== 'revision') || typeof input.revision !== 'string' || !/^\d{1,20}$/.test(input.revision)) throw new ContractFinalizeError('Phiên bản đơn giữ xe không hợp lệ.');
  return {revision:input.revision};
}

// Caller owns the transaction. Handover never collects the advance again.
export async function handoverReservation(client: Database, id: number, actorId: number, revision: string) {
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(actorId) || actorId <= 0) throw new ContractFinalizeError('Đơn giữ xe hoặc người thực hiện không hợp lệ.');
  parseHandoverInput({revision});
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '15s'");
  const order = (await client.query(`SELECT id,order_status,draft_payload,xmin::text AS revision FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,[id])).rows[0];
  if (!order) throw new ContractFinalizeError('Không tìm thấy đơn giữ xe.',404);
  if (order.order_status !== 'deposit_contract' || order.revision !== revision) throw new ContractFinalizeError('Đơn đã thay đổi hoặc đã giao xe. Tải lại trước khi xác nhận.',409);
  const items = await client.query(`SELECT d.id,d.vehicle_id,v.status FROM himoto.order_vehicle_details d JOIN himoto.vehicles v ON v.id=d.vehicle_id
    WHERE d.order_id=$1 AND d.deleted_at IS NULL AND d.completed_at IS NULL ORDER BY v.id FOR UPDATE OF d,v`,[id]);
  if (!items.rowCount || items.rows.some(row=>!['ready','using','rent'].includes(row.status))) throw new ContractFinalizeError('Xe không còn sẵn sàng để giao. Kiểm tra lại kho xe.',409);
  const vehicleIds = items.rows.map(row=>Number(row.vehicle_id));
  const conflicts = await client.query(`SELECT d.id FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
    WHERE d.vehicle_id=ANY($1::bigint[]) AND d.order_id<>$2 AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL
      AND o.order_status IN ('renting','overdue','wait_payment','pending','deposit_contract')`,[vehicleIds,id]);
  if (conflicts.rowCount) throw new ContractFinalizeError('Xe đang thuộc đơn khác. Kiểm tra lại trước khi giao.',409);
  const payload = order.draft_payload || {}, composer = payload.management_composer || {};
  const next = {...payload,management_composer:{...composer,draft:{...composer.draft,reservation:false},handover:{at:new Date().toISOString(),actor_id:actorId}}};
  await client.query(`UPDATE himoto.orders SET order_status='renting',draft_payload=$2,updated_at=now() WHERE id=$1`,[id,JSON.stringify(next)]);
  await client.query(`UPDATE himoto.vehicles SET status='using',updated_at=now() WHERE id=ANY($1::bigint[])`,[vehicleIds]);
  return readPaymentContext(client,id);
}
