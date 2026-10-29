import 'server-only';
import { VEHICLE_ORDER_SQL } from './contract-classification';
import type { PoolClient } from 'pg';
import { ContractFinalizeError } from './contract-finalize';
import { readPaymentContext } from './contract-payments';
import { dataAccess,usesScopedDatabase } from './access-context';
import { canApproveOwnershipContract,requiresOwnershipApproval } from '@/lib/management/contract-approval';
import { checkOwnershipVehicleStock } from './ownership-stock';
import { rentalStockError } from '@/lib/management/rental-stock';

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
  const order = (await client.query(`SELECT id,store_id,order_status,draft_payload,order_type,xmin::text AS revision FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,[id])).rows[0];
  if (!order) throw new ContractFinalizeError('Không tìm thấy đơn giữ xe.',404);
  if (order.order_status !== 'deposit_contract' || order.revision !== revision) throw new ContractFinalizeError('Đơn đã thay đổi hoặc đã giao xe. Tải lại trước khi xác nhận.',409);
  const payload=order.draft_payload||{},composer=payload.management_composer||{},approvalRequired=requiresOwnershipApproval(composer.rental_type)||requiresOwnershipApproval(order.order_type),approver=dataAccess.getStore();
  if(approvalRequired&&approver&&!canApproveOwnershipContract(approver))throw new ContractFinalizeError('Hợp đồng thuê sở hữu cần quản lý duyệt và xác nhận giao xe.',403);
  const items = await client.query(`SELECT d.id,d.vehicle_id FROM himoto.order_vehicle_details d
    WHERE d.order_id=$1 AND d.deleted_at IS NULL AND d.completed_at IS NULL ORDER BY d.vehicle_id FOR UPDATE OF d`,[id]);
  const vehicleIds = items.rows.map(row=>Number(row.vehicle_id));
  const stock=usesScopedDatabase()
    ?await client.query('SELECT id,status,license,store_id,store_name FROM himoto.lock_vehicles_for_contract($1::bigint[])',[vehicleIds])
    :await client.query('SELECT id,status,license,COALESCE(current_store_id,store_id) AS store_id FROM himoto.vehicles WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[vehicleIds]);
  const stockError=await checkOwnershipVehicleStock(client,approvalRequired?'ownership':composer.rental_type,stock.rows);
  if(stockError)throw new ContractFinalizeError(stockError,409);
  const branchStockError=rentalStockError(approvalRequired?'ownership':composer.rental_type,order.store_id,stock.rows);
  if(branchStockError)throw new ContractFinalizeError(branchStockError,409);
  if(!items.rowCount||stock.rowCount!==items.rowCount||stock.rows.some(row=>row.status!=='ready'))throw new ContractFinalizeError('Xe phải đang Lưu kho và đã được cơ sở nhận xác nhận trước khi giao.',409);
  const conflicts = usesScopedDatabase()
    ? await client.query('SELECT license, code, store_name, manager_name FROM himoto.vehicle_other_rental_conflicts($1::bigint[],$2)', [vehicleIds, id])
    : await client.query(`SELECT v.license, COALESCE(NULLIF(o.contract_number,''), NULLIF(o.draft_reference,''), '#' || o.id::text) AS code, s.store_name,
        COALESCE(cu.name, mu.name, '') AS manager_name
      FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id JOIN himoto.vehicles v ON v.id=d.vehicle_id
      LEFT JOIN himoto.stores s ON s.id=o.store_id
      LEFT JOIN himoto.users cu ON cu.id=o.contract_responsible_user_id
      LEFT JOIN himoto.users mu ON mu.id=s.user_id
      WHERE d.vehicle_id=ANY($1::bigint[]) AND d.order_id<>$2 AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
        AND o.order_status IN ('renting','overdue','wait_payment','pending','deposit_contract','bad_debt') ORDER BY v.license`,[vehicleIds,id]);
  if (conflicts.rowCount) {
    throw new ContractFinalizeError(`Xe đang thuộc đơn khác: ${conflicts.rows.map(row => {
      const store = String(row.store_name || '').trim();
      const manager = String(row.manager_name || '').trim();
      return `xe ${row.license} · hợp đồng ${row.code}${store ? ` tại ${store}` : ''}${manager ? ` (phụ trách: ${manager})` : ''}`;
    }).join('; ')}. Kiểm tra lại trước khi giao.`,409);
  }
  const next = {...payload,management_composer:{...composer,draft:{...composer.draft,reservation:false},handover:{at:new Date().toISOString(),actor_id:actorId}}};
  if(approvalRequired&&!composer.approval)next.management_composer.approval={at:next.management_composer.handover.at,actor_id:actorId,actor_role:approver?.access_role||null};
  await client.query(`UPDATE himoto.orders SET order_status='renting',draft_payload=$2,updated_at=now() WHERE id=$1`,[id,JSON.stringify(next)]);
  if (usesScopedDatabase()) await client.query('SELECT himoto.mark_vehicles_using($1::bigint[])',[vehicleIds]);
  else await client.query(`UPDATE himoto.vehicles SET status='using',updated_at=now() WHERE id=ANY($1::bigint[])`,[vehicleIds]);
  return readPaymentContext(client,id);
}
