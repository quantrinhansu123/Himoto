import 'server-only';
import type { PoolClient } from 'pg';

export async function readSePayReceiptEvents(db: Pick<PoolClient, 'query'>, after: string) {
  const { rows } = await db.query(`SELECT e.id,e.order_id,e.mode,e.status,e.amount,e.received_at,
    COALESCE(NULLIF(o.contract_number,''),o.draft_reference,'#'||o.id::text) AS code
    FROM himoto.management_sepay_events e JOIN himoto.orders o ON o.id=e.order_id
    WHERE e.id>$1 AND o.deleted_at IS NULL AND e.status IN ('matched','simulated')
    ORDER BY e.id DESC LIMIT 30`, [after]);
  return rows.map(row => ({
    id: Number(row.id), order_id: Number(row.order_id), mode: String(row.mode), status: String(row.status),
    amount: Number(row.amount), code: String(row.code), received_at: new Date(row.received_at).toISOString(),
  }));
}
