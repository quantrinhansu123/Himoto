import 'server-only';
import type { PoolClient } from 'pg';
import { usesScopedDatabase } from './access-context';
import { VEHICLE_ORDER_SQL } from './contract-classification';

/** Caller owns the transaction and has locked the completed contract. */
export async function releaseCompletedContractVehicles(db:Pick<PoolClient,'query'>,id:number) {
  const lines=(await db.query(`UPDATE himoto.order_vehicle_details d
    SET completed_at=COALESCE(d.completed_at,now()),updated_at=now()
    FROM himoto.orders o WHERE o.id=$1 AND d.order_id=o.id
      AND o.order_status='completed' AND o.deleted_at IS NULL AND d.deleted_at IS NULL
      AND o.draft_payload #> '{management_composer,lifecycle,payment_closure}' IS NULL
    RETURNING d.id,d.vehicle_id`,[id])).rows;
  if(usesScopedDatabase()) {
    for(const line of lines)await db.query('SELECT himoto.release_returned_contract_vehicle($1)',[line.id]);
  } else if(lines.length) {
    await db.query(`UPDATE himoto.vehicles v SET status='ready',updated_at=now()
      WHERE v.id=ANY($1::bigint[]) AND v.status IN('using','rent','bad_debt')
        AND NOT EXISTS(SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
          WHERE d.vehicle_id=v.id AND d.completed_at IS NULL AND d.deleted_at IS NULL
            AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
            AND (o.order_status IN('renting','overdue','wait_payment','pending','deposit_contract','bad_debt') OR (o.order_status='completed' AND o.draft_payload #> '{management_composer,lifecycle,payment_closure}' IS NOT NULL)))`,
    [lines.map(line=>Number(line.vehicle_id))]);
  }
}
