import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { matchingGpsVehicles,type GpsObservation,type GpsProvider } from '@/lib/management/gps';
import { ownerDatabase } from './himoto-database';
import { openIntegrationSecret,sealIntegrationSecret } from './integration-secrets';
import { GpsProviderError,loginGps,readGpsDevices,shouldRefreshGpsSession,type GpsSession } from './gps-providers';

type Database=Pick<PoolClient,'query'>;
export async function persistGpsObservations(client:Database,provider:GpsProvider,observations:GpsObservation[],accountId:string|null=null) {
  if(observations.length>10000)throw new Error('Dữ liệu GPS vượt giới hạn.');
  const vehicles=(await client.query('SELECT id,license FROM himoto.vehicles WHERE license IS NOT NULL')).rows.map(row=>({id:Number(row.id),license:String(row.license)}));
  const unique=new Map<string,GpsObservation>();
  for(const row of observations)if(row.external_id&&row.external_id.length<=191)unique.set(row.external_id,row);
  const rows=[...unique.values()].map(row=>{
    const matches=matchingGpsVehicles(row.name,row.license,vehicles);
    const hasPosition=row.latitude!==null&&row.longitude!==null;
    return {...row,latitude:hasPosition?row.latitude:null,longitude:hasPosition?row.longitude:null,position_recorded_at:hasPosition?row.recorded_at:null,vehicle_id:matches.length===1?matches[0].id:null,mapping_status:matches.length===1?'auto':matches.length>1?'ambiguous':'unmapped'};
  });
  // One bulk statement keeps the sync within serverless limits even for hundreds of devices.
  await client.query(`WITH incoming AS (
      SELECT * FROM jsonb_to_recordset($2::jsonb) AS x(external_id text,provider_device_id text,name text,state text,provider_status text,latitude numeric,longitude numeric,speed numeric,ignition boolean,recorded_at timestamptz,position_recorded_at timestamptz,heartbeat_at timestamptz,reported_at timestamptz,vehicle_id bigint,mapping_status text)
    ), prior AS MATERIALIZED (
      SELECT d.* FROM himoto.gps_devices d JOIN incoming i ON i.external_id=d.external_device_id WHERE d.provider=$1
    ), changed AS (
      SELECT i.* FROM incoming i LEFT JOIN prior d ON d.external_device_id=i.external_id
      WHERE d.id IS NULL OR d.sync_received_at IS NULL OR d.sync_received_at<now()-interval '60 seconds'
        OR (i.state='stopped' AND d.stopped_since IS NULL)
        OR ROW(d.provider_device_name,d.management_status,d.provider_status,d.last_latitude,d.last_longitude,d.last_speed,d.source_account_id,d.provider_device_id)
          IS DISTINCT FROM ROW(i.name,i.state,i.provider_status,COALESCE(i.latitude,d.last_latitude),COALESCE(i.longitude,d.last_longitude),i.speed,$3::uuid,COALESCE(NULLIF(i.provider_device_id,''),d.provider_device_id))
        OR (d.vehicle_id IS NULL AND d.mapping_status NOT IN('manual','manual_unmapped') AND ROW(d.vehicle_id,d.mapping_status) IS DISTINCT FROM ROW(i.vehicle_id,i.mapping_status))
        OR ROW(d.heartbeat_at,d.provider_reported_at,d.position_recorded_at,d.last_ignition) IS DISTINCT FROM ROW(i.heartbeat_at,i.reported_at,COALESCE(i.position_recorded_at,d.position_recorded_at),i.ignition)
    ), upserted AS (
      INSERT INTO himoto.gps_devices(provider,external_device_id,imei,vehicle_id,mapping_status,provider_device_name,management_status,provider_status,heartbeat_at,sync_received_at,status_updated_at,last_latitude,last_longitude,last_speed,last_sync_at,created_at,updated_at,source_account_id,provider_device_id,provider_reported_at,position_recorded_at,last_ignition,stopped_since)
      SELECT $1,external_id,external_id,vehicle_id,mapping_status,name,state,provider_status,heartbeat_at,now(),now(),latitude,longitude,speed,now() AT TIME ZONE 'UTC',now() AT TIME ZONE 'UTC',now() AT TIME ZONE 'UTC',$3::uuid,NULLIF(provider_device_id,''),reported_at,position_recorded_at,ignition,CASE WHEN state='stopped' THEN now() END FROM changed
      ON CONFLICT(provider,external_device_id) DO UPDATE SET
        vehicle_id=CASE WHEN himoto.gps_devices.mapping_status IN('manual','manual_unmapped') THEN himoto.gps_devices.vehicle_id ELSE COALESCE(himoto.gps_devices.vehicle_id,EXCLUDED.vehicle_id) END,
        mapping_status=CASE WHEN himoto.gps_devices.vehicle_id IS NOT NULL OR himoto.gps_devices.mapping_status IN('manual','manual_unmapped') THEN himoto.gps_devices.mapping_status ELSE EXCLUDED.mapping_status END,
        provider_device_name=EXCLUDED.provider_device_name,management_status=EXCLUDED.management_status,provider_status=EXCLUDED.provider_status,
        heartbeat_at=EXCLUDED.heartbeat_at,sync_received_at=now(),source_account_id=EXCLUDED.source_account_id,provider_device_id=COALESCE(EXCLUDED.provider_device_id,himoto.gps_devices.provider_device_id),
        provider_reported_at=EXCLUDED.provider_reported_at,position_recorded_at=COALESCE(EXCLUDED.position_recorded_at,himoto.gps_devices.position_recorded_at),last_ignition=EXCLUDED.last_ignition,
        status_updated_at=CASE WHEN himoto.gps_devices.management_status IS DISTINCT FROM EXCLUDED.management_status THEN now() ELSE himoto.gps_devices.status_updated_at END,
        stopped_since=CASE WHEN EXCLUDED.management_status<>'stopped' THEN NULL
          WHEN himoto.gps_devices.management_status='stopped'
            AND himoto.gps_devices.provider_status IS DISTINCT FROM 'not_visible_in_account'
            AND himoto.gps_devices.source_account_id IS NOT DISTINCT FROM EXCLUDED.source_account_id
            AND (himoto.gps_devices.vehicle_id IS NOT NULL OR EXCLUDED.vehicle_id IS NULL OR himoto.gps_devices.mapping_status IN('manual','manual_unmapped'))
            AND himoto.gps_devices.sync_received_at>=now()-interval '10 minutes'
            AND himoto.gps_devices.sync_received_at<=now()
          THEN COALESCE(himoto.gps_devices.stopped_since,now()) ELSE now() END,
        last_latitude=COALESCE(EXCLUDED.last_latitude,himoto.gps_devices.last_latitude),last_longitude=COALESCE(EXCLUDED.last_longitude,himoto.gps_devices.last_longitude),last_speed=EXCLUDED.last_speed,last_sync_at=now() AT TIME ZONE 'UTC',updated_at=now() AT TIME ZONE 'UTC'
      RETURNING id,vehicle_id,external_device_id,management_status
    ), events AS (
      INSERT INTO himoto.management_gps_status_events(gps_device_id,vehicle_id,from_status,to_status,provider_recorded_at,provider_status)
      SELECT d.id,d.vehicle_id,p.management_status,d.management_status,i.recorded_at,i.provider_status FROM upserted d JOIN incoming i ON i.external_id=d.external_device_id
      LEFT JOIN prior p ON p.external_device_id=d.external_device_id WHERE p.management_status IS DISTINCT FROM d.management_status
    ), devices AS (
      SELECT id,external_device_id FROM upserted
      UNION ALL SELECT id,external_device_id FROM prior p WHERE NOT EXISTS(SELECT 1 FROM upserted u WHERE u.id=p.id)
    )
    INSERT INTO himoto.gps_positions(gps_device_id,latitude,longitude,speed,ignition,provider_recorded_at,received_at,normalized_status,created_at,updated_at)
      SELECT d.id,i.latitude,i.longitude,COALESCE(i.speed,0),COALESCE(i.ignition,false),i.recorded_at AT TIME ZONE 'UTC',now() AT TIME ZONE 'UTC',i.state,now() AT TIME ZONE 'UTC',now() AT TIME ZONE 'UTC'
      FROM devices d JOIN incoming i ON i.external_id=d.external_device_id WHERE i.latitude IS NOT NULL AND i.longitude IS NOT NULL AND i.recorded_at IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM himoto.gps_positions p WHERE p.gps_device_id=d.id AND p.provider_recorded_at=i.recorded_at AT TIME ZONE 'UTC' AND p.normalized_status=i.state)
        AND NOT EXISTS(SELECT 1 FROM (
          SELECT p.normalized_status,p.received_at FROM himoto.gps_positions p WHERE p.gps_device_id=d.id ORDER BY p.provider_recorded_at DESC NULLS LAST LIMIT 1
        ) latest WHERE latest.normalized_status=i.state AND latest.received_at>(now() AT TIME ZONE 'UTC')-interval '30 seconds')
      ON CONFLICT(gps_device_id,provider_recorded_at) DO UPDATE SET normalized_status=EXCLUDED.normalized_status,received_at=EXCLUDED.received_at,updated_at=EXCLUDED.updated_at
        WHERE himoto.gps_positions.normalized_status IS DISTINCT FROM EXCLUDED.normalized_status`,[provider,JSON.stringify(rows),accountId]);
  if(accountId)await client.query(`INSERT INTO himoto.management_gps_account_devices(account_id,gps_device_id)
    SELECT $1,id FROM himoto.gps_devices WHERE provider=$2 AND external_device_id=ANY($3::text[]) ON CONFLICT DO NOTHING`,[accountId,provider,rows.map(row=>row.external_id)]);
  // A missing device is an access change, not an OFF/movement transition. Keep its journal and mapping.
  // Only a complete successful provider list reaches this function.
  if(accountId)await client.query(`UPDATE himoto.gps_devices SET provider_status='not_visible_in_account',stopped_since=NULL,updated_at=now() AT TIME ZONE 'UTC'
    WHERE source_account_id=$1 AND provider=$2 AND NOT(external_device_id=ANY($3::text[]))
      AND provider_status IS DISTINCT FROM 'not_visible_in_account'`,[accountId,provider,rows.map(row=>row.external_id)]);
  return {devices:rows.length,mapped:rows.filter(row=>row.vehicle_id!==null).length};
}
export async function claimGpsAccounts(database:Database,lease:string) {
  return (await database.query(`UPDATE himoto.management_gps_accounts
    SET last_attempt_at=clock_timestamp(),sync_lease_token=$1,sync_lease_until=clock_timestamp()+interval '90 seconds'
    WHERE enabled AND (last_attempt_at IS NULL OR last_attempt_at<clock_timestamp()-interval '4 seconds')
      AND (sync_lease_until IS NULL OR sync_lease_until<clock_timestamp())
      AND (next_attempt_at IS NULL OR next_attempt_at<=clock_timestamp()) RETURNING *`,[lease])).rows;
}
export async function finishGpsAccount(database:Database,id:string,lease:string,deviceCount:number,error:string|null=null) {
  return database.query(`UPDATE himoto.management_gps_accounts SET sync_lease_token=NULL,sync_lease_until=NULL,last_error=$3,
      next_attempt_at=CASE WHEN $3::text IS NULL THEN NULL ELSE clock_timestamp()+interval '30 seconds' END,
      last_success_at=CASE WHEN $3::text IS NULL THEN clock_timestamp() ELSE last_success_at END,
      device_count=CASE WHEN $3::text IS NULL THEN $4 ELSE device_count END WHERE id=$1 AND sync_lease_token=$2`,[id,lease,error,deviceCount]);
}
export async function syncGpsAccounts() {
  const lease=randomUUID(),accounts=await claimGpsAccounts(ownerDatabase,lease);
  const results=await Promise.all(accounts.map(async account=>{
    try {
      let session:GpsSession|undefined=account.session_cipher&&new Date(account.session_expires_at).getTime()>Date.now()?openIntegrationSecret<GpsSession>(account.session_cipher):undefined;
      const credentials=openIntegrationSecret<{password:string}>(account.secret_cipher);
      const remember=()=>ownerDatabase.query("UPDATE himoto.management_gps_accounts SET session_cipher=$2,session_expires_at=now()+interval '60 minutes' WHERE id=$1 AND sync_lease_token=$3",[account.id,sealIntegrationSecret(session),lease]);
      if(!session){session=await loginGps(account.provider,account.username,credentials.password);await remember();}
      let observations:GpsObservation[];
      try {observations=await readGpsDevices(account.provider,session);}
      catch(error){
        if(!shouldRefreshGpsSession(error))throw error;
        session=await loginGps(account.provider,account.username,credentials.password);
        await remember();
        observations=await readGpsDevices(account.provider,session);
      }
      const client=await ownerDatabase.connect();let summary;
      try {await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='20s'");
        if(!(await client.query('SELECT id FROM himoto.management_gps_accounts WHERE id=$1 AND sync_lease_token=$2 FOR UPDATE',[account.id,lease])).rowCount)throw new Error('SYNC_CANCELLED');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`gps-provider:${account.provider}`]);summary=await persistGpsObservations(client,account.provider,observations,account.id);await client.query('COMMIT');}
      catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
      await finishGpsAccount(ownerDatabase,account.id,lease,observations.length);
      return {id:account.id,ok:true,...summary};
    }catch(error){const code=error instanceof GpsProviderError?error.code:'SYNC_FAILED';await finishGpsAccount(ownerDatabase,account.id,lease,0,code);return {id:account.id,ok:false};}
  }));
  return {attempted:accounts.length,succeeded:results.filter(result=>result.ok).length};
}
