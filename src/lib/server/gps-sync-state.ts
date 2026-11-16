import 'server-only';
import {ownerDatabase} from './himoto-database';
import type {MobileGpsSyncState} from '../../../shared/mobile-gps';

/** Only aggregate health crosses the API; credentials and account names stay here. */
export async function readGpsSyncState():Promise<MobileGpsSyncState>{
  const result=await ownerDatabase.query(`SELECT count(*)::integer AS enabled,
    count(*) FILTER(WHERE last_error IS NOT NULL)::integer AS failed,
    max(last_success_at) AS latest,min(last_success_at) AS oldest,
    min(GREATEST(COALESCE(last_attempt_at+interval '60 seconds','epoch'::timestamptz),
      COALESCE(next_attempt_at,'epoch'::timestamptz),COALESCE(sync_lease_until,'epoch'::timestamptz))) AS next,
    EXISTS(SELECT 1 FROM himoto.management_integration_workers WHERE job='gps-live' AND lease_until>clock_timestamp()) AS running,
    (SELECT last_finished_at FROM himoto.management_integration_workers WHERE job='gps-live') AS finished
    FROM himoto.management_gps_accounts WHERE enabled`);
  const row=result.rows[0],iso=(v:unknown)=>v==null?null:v instanceof Date?v.toISOString():new Date(String(v)).toISOString();
  return {inProgress:row.running,enabledAccounts:row.enabled,failedAccounts:row.failed,
    lastFinishedAt:iso(row.finished),latestSuccessAt:iso(row.latest),oldestSuccessAt:iso(row.oldest),nextAttemptAt:iso(row.next)};
}
