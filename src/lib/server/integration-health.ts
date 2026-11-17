import 'server-only';
import { unstable_cache } from 'next/cache';
import { ownerDatabase } from './himoto-database';
import type { PoolClient } from 'pg';

type Database=Pick<PoolClient,'query'>;
// Only non-sensitive, system-wide event counters are cached. Configuration,
// credentials, permissions and the write checksum never pass through this cache.
const cachedEventCounts=unstable_cache(async()=>{
  const result=await ownerDatabase.query(`SELECT count(*) FILTER(WHERE source='history')::int AS history_events,
    count(*) FILTER(WHERE source='webhook')::int AS webhook_events FROM himoto.management_gps_status_events
    WHERE source IN('history','webhook')`);
  return {...result.rows[0],counts_at:new Date().toISOString()};
},['gps-integration-event-counts-v1'],{revalidate:60});

export async function readIntegrationHealth(database:Database=ownerDatabase,counts=cachedEventCounts){
  const live=await database.query(`SELECT count(*)::int AS streams,
    count(*) FILTER(WHERE last_success_at IS NOT NULL)::int AS completed_streams,
    count(*) FILTER(WHERE last_error IS NOT NULL)::int AS failed_streams,
    count(*) FILTER(WHERE covered_until<now()-interval '15 minutes')::int AS behind_streams,
    (SELECT count(*)::int FROM himoto.management_gps_history_cursors c JOIN himoto.gps_devices d ON d.id=c.gps_device_id
      WHERE d.provider_status='not_visible_in_account') AS inaccessible_streams,
    min(covered_until) AS covered_until,max(last_success_at) AS last_success_at,
    (SELECT count(*)::int FROM himoto.management_gps_webhook_receipts WHERE status IN('pending','awaiting_device')) AS waiting_webhooks
    FROM himoto.management_gps_history_cursors`);
  const row=live.rows[0],eventCounts=await counts();
  const date=(v:unknown)=>v==null?null:v instanceof Date?v.toISOString():String(v);
  return {...row,...eventCounts,covered_until:date(row.covered_until),last_success_at:date(row.last_success_at)};
}
