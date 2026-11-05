import 'server-only';
import type { PoolClient } from 'pg';
import { hasRenewalVersion, nextRenewalVersion } from '@/lib/management/contract-renewals';

// The upload form only needs the next version, not Telegram messages or media.
export async function readRenewalPhotoContext(db: Pick<PoolClient, 'query'>, orderId: number) {
  const order = (await db.query(`SELECT draft_payload #> '{management_composer,versions}' AS versions
    FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL`, [orderId])).rows[0];
  if (!order) return null;
  return { next_renewal_version: await nextContractRenewalVersion(db, orderId, order.versions) };
}

// Imported/reconciled contracts may no longer have every version in their JSON.
// Never reuse a number already attached to a saved notice or receipt. Photos for
// the pending renewal do not reserve a number: they are uploaded before saving.
async function references(db: Pick<PoolClient, 'query'>, orderId: number) {
  const refs = await db.query(`WITH presence AS MATERIALIZED (
      SELECT to_regclass('himoto.management_mobile_renewals') IS NOT NULL AS mobile_ledger_present
    ), refs AS (SELECT payload #>> '{renewal,version}' AS version
      FROM himoto.management_contract_notifications WHERE order_id=$1
    UNION ALL SELECT CASE WHEN COALESCE(root_event_key,event_key) LIKE 'renewal:'||$1::text||':%'
      THEN split_part(COALESCE(root_event_key,event_key),':',3) END AS version
      FROM himoto.management_contract_notifications WHERE order_id=$1
    UNION ALL SELECT renewal_payload->>'version' AS version
      FROM himoto.management_contract_payments WHERE order_id=$1)
    SELECT refs.version,presence.mobile_ledger_present FROM presence LEFT JOIN refs ON true`, [orderId]);
  // Keep existing web installations working before the optional mobile migration.
  // Metadata is branch-readable for numbering; receipt APIs remain actor-bound.
  if (refs.rows.some(row => row.mobile_ledger_present === true)) {
    const mobile = await db.query('SELECT renewal_version::text AS version FROM himoto.management_mobile_renewals WHERE order_id=$1', [orderId]);
    return [...refs.rows, ...mobile.rows];
  }
  return refs.rows;
}
export async function nextContractRenewalVersion(db: Pick<PoolClient, 'query'>, orderId: number, versions: unknown) {
  const refs = await references(db,orderId);
  return Math.max(nextRenewalVersion(versions), nextRenewalVersion(refs.map(row => ({kind: 'renewal', version: row.version}))));
}

export async function hasContractRenewalVersion(db: Pick<PoolClient, 'query'>, orderId: number, versions: unknown, version: number): Promise<boolean> {
  if (hasRenewalVersion(versions, version)) return true;
  const refs = await references(db,orderId);
  return refs.some(row => Number(row.version) === version);
}
/** Photo discovery uses the same legacy JSON and durable references accepted
 * by requireContractPhotoSlot, including both permissive pending versions. */
export async function contractRenewalMediaVersions(db:Pick<PoolClient,'query'>,orderId:number,versions:unknown,open:boolean) {
  const refs=await references(db,orderId),list=Array.isArray(versions)?versions:[];
  const saved=[...list.filter(v=>v&&typeof v==='object'&&v.kind==='renewal'&&Number(v.version)>=2).map(v=>Number(v.version)),...refs.map(v=>Number(v.version))];
  if(open)saved.push(nextRenewalVersion(versions),Math.max(nextRenewalVersion(versions),nextRenewalVersion(refs.map(v=>({kind:'renewal',version:v.version})))));
  return [...new Set(saved)].filter(v=>Number.isSafeInteger(v)&&v>0&&v<=999999999999999).sort((a,b)=>b-a);
}
