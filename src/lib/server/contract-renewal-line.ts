import 'server-only';
import type { PoolClient } from 'pg';
import { usesScopedDatabase } from './access-context';

export async function extendContractVehicleLine(db: Pick<PoolClient, 'query'>, orderId: number, itemId: number, revision: string, returnAt: string, amount: number) {
  if (usesScopedDatabase()) {
    await db.query('SELECT himoto.extend_contract_vehicle_line($1,$2,$3,$4::timestamptz,$5::bigint)', [itemId, orderId, revision, returnAt, amount]);
  } else {
    await db.query(`UPDATE himoto.order_vehicle_details SET return_at=$3::timestamptz,
      total_renewal_amount=COALESCE(total_renewal_amount,0)+$4,updated_at=now() WHERE id=$1 AND order_id=$2`, [itemId, orderId, returnAt, amount]);
  }
}
