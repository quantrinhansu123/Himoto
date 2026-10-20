import 'server-only';
import type { PoolClient } from 'pg';
import { VEHICLE_ORDER_SQL } from './contract-classification';

/** Only the newest attempt per transaction matters; an initial manual snapshot remains after a successful send. */
export async function readPendingContractTelegram(db: Pick<PoolClient, 'query'>, storeId: number | null, page = 1) {
  const result = await db.query(`WITH latest AS (
      SELECT DISTINCT ON (n.order_id,COALESCE(n.root_event_key,n.event_key))
        n.order_id,COALESCE(n.root_event_key,n.event_key) AS event_key,n.event_type,n.status,n.error_code,n.created_at,
        COALESCE(NULLIF(o.contract_number,''),o.draft_reference,'#'||o.id::text) AS code,
        COALESCE(NULLIF(o.customer_name,''),c.name,'') AS customer_name,o.store_id,s.store_name
      FROM himoto.management_contract_notifications n JOIN himoto.orders o ON o.id=n.order_id
      LEFT JOIN himoto.customers c ON c.id=o.customer_id LEFT JOIN himoto.stores s ON s.id=o.store_id
      WHERE o.deleted_at IS NULL AND o.order_status NOT IN ('draft','cancelled') AND ${VEHICLE_ORDER_SQL}
        AND ($1::bigint IS NULL OR o.store_id=$1)
      ORDER BY n.order_id,COALESCE(n.root_event_key,n.event_key),n.created_at DESC,n.id DESC
    ), pending AS (SELECT * FROM latest WHERE status IN ('manual','awaiting_config','failed','unknown'))
    SELECT (SELECT count(*)::int FROM pending) AS total,
      COALESCE((SELECT jsonb_agg(page_rows) FROM (
        SELECT * FROM pending ORDER BY created_at DESC,order_id DESC,event_key LIMIT 30 OFFSET $2
      ) page_rows),'[]'::jsonb) AS rows`,
    [storeId,(page-1)*30]);
  return { total: result.rows[0]?.total || 0, page, rows: (result.rows[0]?.rows || []).map((row:Record<string,unknown>) => {
    return { ...row, order_id:Number(row.order_id),store_id:Number(row.store_id),created_at:new Date(String(row.created_at)).toISOString() };
  }) };
}
