import 'server-only';
import { randomUUID } from 'node:crypto';
import { ownerDatabase } from './himoto-database';
import { openIntegrationSecret } from './integration-secrets';
import { GpsProviderError,type GpsSession } from './gps-providers';
import { readGpsAlarmHistory,readGpsMotionHistory } from './gps-history-providers';
import { persistGpsMotionHistory,persistGpsProviderEvents } from './gps-event-records';
import { processWaitingGpsWebhooks } from './gps-webhooks';
import type { GpsProvider } from '@/lib/management/gps';

/** History uses a separate lease and runs after the live HTTP response. It never writes current vehicle/GPS state. */
export async function syncGpsEventHistory(limit=6,budgetMs=18000,database=ownerDatabase,send:typeof fetch=fetch) {
  const lease=randomUUID();
  const claimed=await database.query(`UPDATE himoto.management_gps_event_worker SET lease_token=$1,lease_until=now()+interval '45 seconds'
    WHERE singleton=true AND (lease_until IS NULL OR lease_until<now()) RETURNING singleton`,[lease]);
  if(!claimed.rowCount)return {attempted:0,succeeded:0,busy:true};
  const deadline=Date.now()+Math.min(Math.max(budgetMs,1000),25000);let attempted=0,succeeded=0,inserted=0;
  const boundedFetch:typeof fetch=(url,options)=>{
    const remaining=deadline-Date.now();if(remaining<250)throw new GpsProviderError('HISTORY_BUDGET');
    return send(url,{...options,signal:AbortSignal.timeout(Math.max(1,Math.min(8000,remaining)))});
  };
  try {
    await processWaitingGpsWebhooks(database);
    await database.query(`INSERT INTO himoto.management_gps_history_cursors(gps_device_id,stream,account_id,coverage_started_at,covered_until)
      SELECT d.id,x.stream,a.id,now()-interval '1 hour',now()-interval '1 hour'
      FROM himoto.gps_devices d JOIN himoto.management_gps_accounts a ON a.id=d.source_account_id AND a.enabled
      JOIN himoto.management_gps_event_channels c ON c.account_id=a.id CROSS JOIN (VALUES('motion'),('alarms')) x(stream)
      WHERE (x.stream='motion' AND c.motion_enabled OR x.stream='alarms' AND c.alarms_enabled)
        AND (a.provider<>'protrack' OR d.provider_device_id IS NOT NULL)
      ON CONFLICT DO NOTHING`);
    while(attempted<Math.min(Math.max(limit,1),30)&&Date.now()<deadline-500) {
      const row=(await database.query(`WITH candidate AS (
        SELECT c.gps_device_id,c.stream FROM himoto.management_gps_history_cursors c
        JOIN himoto.management_gps_accounts a ON a.id=c.account_id AND a.enabled
        JOIN himoto.management_gps_event_channels s ON s.account_id=a.id
        WHERE c.next_attempt_at<=now() AND a.session_cipher IS NOT NULL AND a.session_expires_at>now()+interval '10 seconds'
          AND a.last_success_at>now()-interval '5 minutes'
          AND (s.history_pause_until IS NULL OR s.history_pause_until<=now())
          AND NOT EXISTS(SELECT 1 FROM himoto.management_gps_history_cursors recent
            WHERE recent.account_id=c.account_id AND recent.stream=c.stream AND recent.last_attempt_at>now()-interval '5 seconds')
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
      const end=Math.min(covered+30*60_000,Date.now()-30000);
      if(end<=start){await database.query("UPDATE himoto.management_gps_history_cursors SET next_attempt_at=now()+interval '60 seconds' WHERE gps_device_id=$1 AND stream=$2",[deviceId,row.stream]);continue;}
      try {
        const session=openIntegrationSecret<GpsSession>(row.session_cipher),provider=row.provider as GpsProvider;
        const values=row.stream==='motion'?await readGpsMotionHistory(provider,session,row,start,end,boundedFetch):await readGpsAlarmHistory(provider,session,row,start,end,boundedFetch);
        const client=await database.connect();
        try {
          await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='10s'");
          if(!(await client.query('SELECT singleton FROM himoto.management_gps_event_worker WHERE singleton=true AND lease_token=$1 AND lease_until>now() FOR UPDATE',[lease])).rowCount)throw new Error('HISTORY_LEASE_LOST');
          const added=row.stream==='motion'?await persistGpsMotionHistory(client,deviceId,values as Awaited<ReturnType<typeof readGpsMotionHistory>>,new Date(start).toISOString()):await persistGpsProviderEvents(client,deviceId,values as Awaited<ReturnType<typeof readGpsAlarmHistory>>,'history');
          await client.query(`UPDATE himoto.management_gps_history_cursors SET covered_until=GREATEST(covered_until,$3),last_success_at=now(),last_error=NULL,
            records_received=records_received+$4,next_attempt_at=CASE WHEN $3::timestamptz<now()-interval '2 minutes' THEN now() ELSE now()+interval '60 seconds' END
            WHERE gps_device_id=$1 AND stream=$2`,[deviceId,row.stream,new Date(end).toISOString(),values.length]);
          await client.query("UPDATE himoto.management_gps_event_channels SET last_error=NULL,history_pause_until=NULL WHERE account_id=$1 AND last_error LIKE 'HISTORY_%'",[row.account_id]);
          await client.query('COMMIT');succeeded++;inserted+=added;
        }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
      }catch(error) {
        const code=error instanceof GpsProviderError?error.code:error instanceof Error&&/^GPS_|^HISTORY_/.test(error.message)?error.message:'HISTORY_READ_FAILED';
        await database.query("UPDATE himoto.management_gps_history_cursors SET last_error=$3,next_attempt_at=now()+interval '2 minutes' WHERE gps_device_id=$1 AND stream=$2",[deviceId,row.stream,code]);
        if(/HTTP_429|10009/.test(code))await database.query("UPDATE himoto.management_gps_event_channels SET history_pause_until=now()+interval '60 seconds',last_error=$2 WHERE account_id=$1",[row.account_id,code]);
        if(/HTTP_429|10009|HISTORY_BUDGET/.test(code))break;
      }
    }
    return {attempted,succeeded,inserted,busy:false};
  }finally{await database.query('UPDATE himoto.management_gps_event_worker SET lease_token=NULL,lease_until=NULL WHERE singleton=true AND lease_token=$1',[lease]);}
}
