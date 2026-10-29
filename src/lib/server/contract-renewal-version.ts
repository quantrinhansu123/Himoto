import 'server-only';
import type { PoolClient } from 'pg';
import { nextRenewalVersion } from '@/lib/management/contract-renewals';

// Imported/reconciled contracts may no longer have every version in their JSON.
// Never reuse a number already attached to a saved notice or receipt. Photos for
// the pending renewal do not reserve a number: they are uploaded before saving.
export async function nextContractRenewalVersion(db: Pick<PoolClient, 'query'>, orderId: number, versions: unknown) {
  const refs = await db.query(`SELECT payload #>> '{renewal,version}' AS version
      FROM himoto.management_contract_notifications WHERE order_id=$1
    UNION ALL SELECT CASE WHEN COALESCE(root_event_key,event_key) LIKE 'renewal:'||$1::text||':%'
      THEN split_part(COALESCE(root_event_key,event_key),':',3) END AS version
      FROM himoto.management_contract_notifications WHERE order_id=$1
    UNION ALL SELECT renewal_payload->>'version' AS version
      FROM himoto.management_contract_payments WHERE order_id=$1`, [orderId]);
  return Math.max(nextRenewalVersion(versions), nextRenewalVersion(refs.rows.map(row => ({kind: 'renewal', version: row.version}))));
}
