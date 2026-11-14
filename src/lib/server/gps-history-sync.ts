import 'server-only';
import { randomUUID } from 'node:crypto';
import { ownerDatabase } from './himoto-database';
import { openIntegrationSecret } from './integration-secrets';
import { GpsProviderError,type GpsSession } from './gps-providers';
import { readGpsAlarmHistory,readGpsMotionHistory } from './gps-history-providers';
import { persistGpsMotionHistory,persistGpsProviderEvents } from './gps-event-records';
import { processWaitingGpsWebhooks } from './gps-webhooks';
import type { GpsProvider } from '@/lib/management/gps';
import { gpsBudgetFetch } from './gps-budget-fetch';

export function historyBackoffMs(failures:number){return Math.min(30*60_000,60_000*2**Math.min(Math.max(failures,1),5));}

/** History uses a separate lease and runs after the live HTTP response. It never writes current vehicle/GPS state. */
export async function syncGpsEventHistory(limit=2,budgetMs=8000,database=ownerDatabase,send:typeof fetch=fetch) {
  const lease=randomUUID();
  const claimed=await database.query(`UPDATE himoto.management_gps_event_worker SET lease_token=$1,lease_until=now()+interval '45 seconds'
    WHERE singleton=true AND (lease_until IS NULL OR lease_until<now()) RETURNING singleton`,[lease]);
  if(!claimed.rowCount)return {attempted:0,succeeded:0,busy:true};
  const deadline=Date.now()+Math.min(Math.max(budgetMs,1000),25000);let attempted=0,succeeded=0,inserted=0;
  const boundedFetch=gpsBudgetFetch(send,deadline-Date.now(),'HISTORY_BUDGET',8000);
  try {
    await processWaitingGpsWebhooks(database);
    await database.query(`INSERT INTO himoto.management_gps_history_cursors AS cursor(gps_device_id,stream,account_id,coverage_started_at,covered_until)
      SELECT d.id,x.stream,a.id,now()-interval '1 hour',now()-interval '1 hour'
      FROM himoto.gps_devices d JOIN himoto.management_gps_accounts a ON a.id=d.source_account_id AND a.enabled
      JOIN himoto.management_gps_event_channels c ON c.account_id=a.id CROSS JOIN (VALUES('motion'),('alarms')) x(stream)
      WHERE (x.stream='motion' AND c.motion_enabled OR x.stream='alarms' AND c.alarms_enabled)
        AND (a.provider<>'protrack' OR d.provider_device_id IS NOT NULL)
        AND d.provider_status IS DISTINCT FROM 'not_visible_in_account'
      ON CONFLICT(gps_device_id,stream) DO UPDATE SET account_id=EXCLUDED.account_id
        WHERE cursor.account_id IS DISTINCT FROM EXCLUDED.account_id`);
    while(attempted<Math.min(Math.max(limit,1),30)&&Date.now()<deadline-500) {
      const row=(await database.query(`WITH candidate AS (
        SELECT c.gps_device_id,c.stream FROM himoto.management_gps_history_cursors c
        JOIN himoto.management_gps_accounts a ON a.id=c.account_id AND a.enabled
        JOIN himoto.gps_devices d ON d.id=c.gps_device_id AND d.source_account_id=c.account_id
          AND d.provider_status IS DISTINCT FROM 'not_visible_in_account'
        JOIN himoto.management_gps_event_channels s ON s.account_id=a.id
        WHERE c.next_attempt_at<=now() AND a.session_cipher IS NOT NULL AND a.session_expires_at>now()+interval '10 seconds'
          AND a.last_success_at>now()-interval '5 minutes'
          AND (s.history_pause_until IS NULL OR s.history_pause_until<=now())
          AND (s.history_next_request_at IS NULL OR s.history_next_request_at<=clock_timestamp())
          -- Reserve the time around the next live poll for fresh device state.
          AND (a.last_attempt_at IS NULL OR a.last_attempt_at BETWEEN now()-interval '45 seconds' AND now()-interval '15 seconds')
          AND NOT EXISTS(SELECT 1 FROM himoto.management_gps_history_cursors recent
            WHERE recent.account_id=c.account_id AND recent.last_attempt_at>now()-interval '5 seconds')
          AND (c.stream='motion' AND s.motion_enabled OR c.stream='alarms' AND s.alarms_enabled)
        ORDER BY c.covered_until,c.gps_device_id,c.stream FOR UPDATE OF c SKIP LOCKED LIMIT 1
      ), claimed AS (
        UPDATE himoto.management_gps_history_cursors c SET last_attempt_at=now(),next_attempt_at=now()+interval '90 seconds'
        FROM candidate x WHERE c.gps_device_id=x.gps_device_id AND c.stream=x.stream RETURNING c.*
      ) SELECT c.*,d.external_device_id,d.provider_device_id,a.provider,a.session_cipher
        FROM claimed c JOIN himoto.gps_devices d ON d.id=c.gps_device_id JOIN himoto.management_gps_accounts a ON a.id=c.account_id`)).rows[0];
      if(!row)break;attempted++;
      const deviceId=Number(row.gps_device_id),covered=new Date(row.covered_until).getTime();
      const start=Math.max(new Date(row.coverage_started_at).getTime(),covered-120000);
      const windowMinutes=Math.min(1438,Math.max(5,Number(row.window_minutes)||58));
      const end=Math.min(covered+windowMinutes*60_000,Date.now()-30000);
      if(end<=start){await database.query("UPDATE himoto.management_gps_history_cursors SET next_attempt_at=now()+interval '60 seconds' WHERE gps_device_id=$1 AND stream=$2",[deviceId,row.stream]);continue;}
      try {
        const session=openIntegrationSecret<GpsSession>(row.session_cipher),provider=row.provider as GpsProvider;
        // Shared per-account reservation also covers pagination, other streams,
        // web requests and different serverless instances. No sleeping worker.
        const pacedFetch:typeof fetch=async(url,options)=>{
          const reserved=await database.query(`UPDATE himoto.management_gps_event_channels SET
            history_next_request_at=clock_timestamp()+($2::integer*interval '1 second')
            WHERE account_id=$1 AND (history_next_request_at IS NULL OR history_next_request_at<=clock_timestamp())
              AND (history_pause_until IS NULL OR history_pause_until<=clock_timestamp()) RETURNING account_id`,[row.account_id,provider==='protrack'?15:5]);
          if(!reserved.rowCount)throw new GpsProviderError('HISTORY_RATE_WAIT');
          return boundedFetch(url,options);
        };
        const values=row.stream==='motion'?await readGpsMotionHistory(provider,session,row,start,end,pacedFetch):await readGpsAlarmHistory(provider,session,row,start,end,pacedFetch);
        const client=await database.connect();
        try {
          await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='10s'");
          if(!(await client.query('SELECT singleton FROM himoto.management_gps_event_worker WHERE singleton=true AND lease_token=$1 AND lease_until>now() FOR UPDATE',[lease])).rowCount)throw new Error('HISTORY_LEASE_LOST');
          const added=row.stream==='motion'?await persistGpsMotionHistory(client,deviceId,values as Awaited<ReturnType<typeof readGpsMotionHistory>>,new Date(start).toISOString()):await persistGpsProviderEvents(client,deviceId,values as Awaited<ReturnType<typeof readGpsAlarmHistory>>,'history');
          await client.query(`UPDATE himoto.management_gps_history_cursors SET covered_until=GREATEST(covered_until,$3),last_success_at=now(),last_error=NULL,
            window_minutes=CASE WHEN $4<500 THEN LEAST(1438,window_minutes*2) ELSE window_minutes END,
            records_received=records_received+$4,next_attempt_at=CASE WHEN $3::timestamptz<now()-interval '2 minutes' THEN now() ELSE now()+interval '60 seconds' END
            WHERE gps_device_id=$1 AND stream=$2`,[deviceId,row.stream,new Date(end).toISOString(),values.length]);
          await client.query("UPDATE himoto.management_gps_event_channels SET last_error=NULL,history_pause_until=NULL,history_failures=0 WHERE account_id=$1",[row.account_id]);
          await client.query('COMMIT');succeeded++;inserted+=added;
        }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
      }catch(error) {
        const code=error instanceof GpsProviderError?error.code:error instanceof Error&&/^GPS_|^HISTORY_/.test(error.message)?error.message:'HISTORY_READ_FAILED';
        const smaller=/HISTORY_(INCOMPLETE|PAGINATION_STALLED|RATE_WAIT|BUDGET)|PROTRACK_10006/.test(code);
        await database.query(`UPDATE himoto.management_gps_history_cursors SET last_error=$3,
          window_minutes=CASE WHEN $4 THEN GREATEST(5,window_minutes/2) ELSE window_minutes END,
          next_attempt_at=now()+CASE WHEN $3='HISTORY_RATE_WAIT' THEN interval '15 seconds' ELSE interval '2 minutes' END
          WHERE gps_device_id=$1 AND stream=$2`,[deviceId,row.stream,code,smaller]);
        if(code!=='HISTORY_RATE_WAIT')await database.query(`UPDATE himoto.management_gps_event_channels SET
          history_failures=LEAST(history_failures+1,10),last_error=$2,
          history_pause_until=clock_timestamp()+(LEAST(1800000,60000*power(2,LEAST(history_failures+1,5)))::integer*interval '1 millisecond')
          WHERE account_id=$1`,[row.account_id,code]);
        // One throttled account must not starve the other provider's backlog.
        if(code==='HISTORY_BUDGET')break;
      }
    }
    return {attempted,succeeded,inserted,busy:false};
  }finally{await database.query('UPDATE himoto.management_gps_event_worker SET lease_token=NULL,lease_until=NULL WHERE singleton=true AND lease_token=$1',[lease]);}
}
