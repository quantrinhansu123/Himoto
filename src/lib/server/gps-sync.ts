import 'server-only';
import type { PoolClient } from 'pg';
import { matchingGpsVehicles,type GpsObservation,type GpsProvider } from '@/lib/management/gps';
import { ownerDatabase } from './himoto-database';
import { openIntegrationSecret,sealIntegrationSecret } from './integration-secrets';
import { GpsProviderError,loginGps,readGpsDevices,type GpsSession } from './gps-providers';

type Database=Pick<PoolClient,'query'>;
export async function persistGpsObservations(client:Database,provider:GpsProvider,observations:GpsObservation[]) {
  if(observations.length>10000)throw new Error('Dữ liệu GPS vượt giới hạn.');
  const vehicles=(await client.query('SELECT id,license FROM himoto.vehicles WHERE license IS NOT NULL')).rows.map(row=>({id:Number(row.id),license:String(row.license)}));
  const unique=new Map<string,GpsObservation>();
  for(const row of observations)if(row.external_id&&row.external_id.length<=191)unique.set(row.external_id,row);
  const rows=[...unique.values()].map(row=>{
    const matches=matchingGpsVehicles(row.name,row.license,vehicles);
    return {...row,vehicle_id:matches.length===1?matches[0].id:null,mapping_status:matches.length===1?'auto':matches.length>1?'ambiguous':'unmapped'};
  });
  // One bulk statement keeps the sync within serverless limits even for hundreds of devices.
  await client.query(`WITH incoming AS (
      SELECT * FROM jsonb_to_recordset($2::jsonb) AS x(external_id text,name text,state text,provider_status text,latitude numeric,longitude numeric,speed numeric,ignition boolean,recorded_at timestamptz,heartbeat_at timestamptz,vehicle_id bigint,mapping_status text)
    ), prior AS MATERIALIZED (
      SELECT d.id,d.external_device_id,d.management_status FROM himoto.gps_devices d JOIN incoming i ON i.external_id=d.external_device_id WHERE d.provider=$1
    ), upserted AS (
      INSERT INTO himoto.gps_devices(provider,external_device_id,imei,vehicle_id,mapping_status,provider_device_name,management_status,provider_status,heartbeat_at,sync_received_at,status_updated_at,last_latitude,last_longitude,last_speed,last_sync_at,created_at,updated_at)
      SELECT $1,external_id,external_id,vehicle_id,mapping_status,name,state,provider_status,heartbeat_at,now(),now(),latitude,longitude,speed,now() AT TIME ZONE 'UTC',now() AT TIME ZONE 'UTC',now() AT TIME ZONE 'UTC' FROM incoming
      ON CONFLICT(provider,external_device_id) DO UPDATE SET
        vehicle_id=CASE WHEN himoto.gps_devices.mapping_status IN('manual','manual_unmapped') THEN himoto.gps_devices.vehicle_id ELSE COALESCE(himoto.gps_devices.vehicle_id,EXCLUDED.vehicle_id) END,
        mapping_status=CASE WHEN himoto.gps_devices.vehicle_id IS NOT NULL OR himoto.gps_devices.mapping_status IN('manual','manual_unmapped') THEN himoto.gps_devices.mapping_status ELSE EXCLUDED.mapping_status END,
        provider_device_name=EXCLUDED.provider_device_name,management_status=EXCLUDED.management_status,provider_status=EXCLUDED.provider_status,
        heartbeat_at=EXCLUDED.heartbeat_at,sync_received_at=now(),
        status_updated_at=CASE WHEN himoto.gps_devices.management_status IS DISTINCT FROM EXCLUDED.management_status THEN now() ELSE himoto.gps_devices.status_updated_at END,
        last_latitude=COALESCE(EXCLUDED.last_latitude,himoto.gps_devices.last_latitude),last_longitude=COALESCE(EXCLUDED.last_longitude,himoto.gps_devices.last_longitude),last_speed=EXCLUDED.last_speed,last_sync_at=now() AT TIME ZONE 'UTC',updated_at=now() AT TIME ZONE 'UTC'
      RETURNING id,vehicle_id,external_device_id,management_status
    ), events AS (
      INSERT INTO himoto.management_gps_status_events(gps_device_id,vehicle_id,from_status,to_status,provider_recorded_at,provider_status)
      SELECT d.id,d.vehicle_id,p.management_status,d.management_status,i.recorded_at,i.provider_status FROM upserted d JOIN incoming i ON i.external_id=d.external_device_id
      LEFT JOIN prior p ON p.external_device_id=d.external_device_id WHERE p.management_status IS DISTINCT FROM d.management_status
    )
    INSERT INTO himoto.gps_positions(gps_device_id,latitude,longitude,speed,ignition,provider_recorded_at,received_at,normalized_status,created_at,updated_at)
      SELECT d.id,i.latitude,i.longitude,COALESCE(i.speed,0),COALESCE(i.ignition,false),i.recorded_at AT TIME ZONE 'UTC',now() AT TIME ZONE 'UTC',i.state,now() AT TIME ZONE 'UTC',now() AT TIME ZONE 'UTC'
      FROM upserted d JOIN incoming i ON i.external_id=d.external_device_id WHERE i.latitude IS NOT NULL AND i.longitude IS NOT NULL AND i.recorded_at IS NOT NULL
      ON CONFLICT(gps_device_id,provider_recorded_at) DO UPDATE SET normalized_status=EXCLUDED.normalized_status,received_at=EXCLUDED.received_at,updated_at=EXCLUDED.updated_at`,[provider,JSON.stringify(rows)]);
  return {devices:rows.length,mapped:rows.filter(row=>row.vehicle_id!==null).length};
}
export async function syncGpsAccounts() {
  const accounts=(await ownerDatabase.query(`UPDATE himoto.management_gps_accounts SET last_attempt_at=now()
    WHERE enabled AND (last_attempt_at IS NULL OR last_attempt_at<now()-interval '25 seconds') RETURNING *`)).rows;
  const results=await Promise.all(accounts.map(async account=>{
    try {
      let session:GpsSession|undefined=account.session_cipher&&new Date(account.session_expires_at).getTime()>Date.now()?openIntegrationSecret<GpsSession>(account.session_cipher):undefined;
      const credentials=openIntegrationSecret<{password:string}>(account.secret_cipher);
      if(!session){session=await loginGps(account.provider,account.username,credentials.password);await ownerDatabase.query("UPDATE himoto.management_gps_accounts SET session_cipher=$2,session_expires_at=now()+interval '60 minutes' WHERE id=$1",[account.id,sealIntegrationSecret(session)]);}
      let observations:GpsObservation[];
      try {observations=await readGpsDevices(account.provider,session);}
      catch(error){
        if(!(error instanceof GpsProviderError))throw error;
        session=await loginGps(account.provider,account.username,credentials.password);
        await ownerDatabase.query("UPDATE himoto.management_gps_accounts SET session_cipher=$2,session_expires_at=now()+interval '60 minutes' WHERE id=$1",[account.id,sealIntegrationSecret(session)]);
        observations=await readGpsDevices(account.provider,session);
      }
      const client=await ownerDatabase.connect();let summary;
      try {await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='20s'");await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`gps-provider:${account.provider}`]);summary=await persistGpsObservations(client,account.provider,observations);await client.query('COMMIT');}
      catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
      await ownerDatabase.query('UPDATE himoto.management_gps_accounts SET last_success_at=now(),last_error=NULL,device_count=$2 WHERE id=$1',[account.id,observations.length]);
      return {id:account.id,ok:true,...summary};
    }catch(error){const code=error instanceof GpsProviderError?error.code:'SYNC_FAILED';await ownerDatabase.query('UPDATE himoto.management_gps_accounts SET last_error=$2 WHERE id=$1',[account.id,code]);return {id:account.id,ok:false};}
  }));
  return {attempted:accounts.length,succeeded:results.filter(result=>result.ok).length};
}
