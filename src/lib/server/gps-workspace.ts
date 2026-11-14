import 'server-only';
import type {PoolClient} from 'pg';

// The web and mobile workspaces share exactly the same fleet, availability and event queries.
export async function readGpsWorkspace(db:Pick<PoolClient,'query'>,store:string,source:string,device:string) {
    const rows=await db.query(`SELECT d.id,d.vehicle_id,d.provider,d.external_device_id,d.provider_device_name,d.mapping_status,CASE WHEN d.provider_status='not_visible_in_account' THEN 'unavailable' ELSE d.management_status END AS management_status,CASE WHEN d.provider_status='not_visible_in_account' THEN d.sync_received_at ELSE COALESCE(a.last_success_at,d.sync_received_at) END AS sync_received_at,d.heartbeat_at,d.last_latitude,d.last_longitude,d.last_speed,d.provider_reported_at,d.position_recorded_at,d.last_ignition,
      d.stopped_since,d.provider_stopped_since,v.license,v.status AS vehicle_status,COALESCE(v.current_store_id,v.store_id) AS store_id,s.store_name
      FROM himoto.gps_devices d LEFT JOIN himoto.management_gps_accounts a ON a.id=d.source_account_id
      LEFT JOIN himoto.vehicles v ON v.id=d.vehicle_id LEFT JOIN himoto.stores s ON s.id=COALESCE(v.current_store_id,v.store_id)
      WHERE (d.vehicle_id IS NULL OR v.id IS NOT NULL AND v.deleted_at IS NULL)
        AND ($1::bigint IS NULL OR COALESCE(v.current_store_id,v.store_id)=$1) ORDER BY CASE WHEN d.provider_status='not_visible_in_account' THEN d.sync_received_at ELSE COALESCE(a.last_success_at,d.sync_received_at) END DESC NULLS LAST,d.id DESC`,[store==='all'?null:Number(store)]);
    // Inventory is the source of the fleet, including vehicles without a device.
    const missing=await db.query(`SELECT -v.id AS id,v.id AS vehicle_id,NULL::text AS provider,'' AS external_device_id,
      '' AS provider_device_name,'unmapped' AS mapping_status,'none' AS management_status,
      NULL AS sync_received_at,NULL AS heartbeat_at,NULL AS last_latitude,NULL AS last_longitude,NULL AS last_speed,
      v.license,v.status AS vehicle_status,COALESCE(v.current_store_id,v.store_id) AS store_id,s.store_name
      FROM himoto.vehicles v LEFT JOIN himoto.stores s ON s.id=COALESCE(v.current_store_id,v.store_id)
      WHERE v.deleted_at IS NULL AND ($1::bigint IS NULL OR COALESCE(v.current_store_id,v.store_id)=$1)
        AND NOT EXISTS(SELECT 1 FROM himoto.gps_devices d WHERE d.vehicle_id=v.id) ORDER BY v.id`,[store==='all'?null:Number(store)]);
    rows.rows.push(...missing.rows);
    const events=await db.query(`SELECT e.id,e.vehicle_id,e.from_status,e.to_status,e.observed_at,e.event_kind,e.source,
      CASE WHEN e.source='poll' THEN e.observed_at ELSE COALESCE(e.provider_recorded_at,e.observed_at) END AS event_at,
      COALESCE(v.license,d.provider_device_name,d.external_device_id) AS license
      FROM himoto.management_gps_status_events e JOIN himoto.gps_devices d ON d.id=e.gps_device_id LEFT JOIN himoto.vehicles v ON v.id=e.vehicle_id
      WHERE ($1::bigint IS NULL OR COALESCE(v.current_store_id,v.store_id)=$1)
        AND ($2::text IS NULL OR e.source=$2) AND ($3::bigint IS NULL OR e.gps_device_id=$3)
      ORDER BY event_at DESC,e.id DESC LIMIT 100`,[store==='all'?null:Number(store),source==='all'?null:source,device?Number(device):null]);
    return {devices:rows.rows.map(row=>({...row,id:Number(row.id),vehicle_id:row.vehicle_id===null?null:Number(row.vehicle_id),store_id:row.store_id===null?null:Number(row.store_id),last_latitude:row.last_latitude===null?null:Number(row.last_latitude),last_longitude:row.last_longitude===null?null:Number(row.last_longitude),last_speed:row.last_speed===null?null:Number(row.last_speed)})),events:events.rows};
}

// Preserve the web mapping mutation, including the stop clocks on an actual reassignment.
export async function writeGpsMapping(db:Pick<PoolClient,'query'>,deviceId:number,vehicleId:number|null) {
  return db.query(`UPDATE himoto.gps_devices SET stopped_since=CASE WHEN vehicle_id IS DISTINCT FROM $2::bigint THEN NULL ELSE stopped_since END,provider_stopped_since=CASE WHEN vehicle_id IS DISTINCT FROM $2::bigint THEN NULL ELSE provider_stopped_since END,vehicle_id=$2,mapping_status=CASE WHEN $2::bigint IS NULL THEN 'manual_unmapped' ELSE 'manual' END,updated_at=now() AT TIME ZONE 'UTC'
      WHERE id=$1 AND ($2::bigint IS NULL OR EXISTS(SELECT 1 FROM himoto.vehicles WHERE id=$2)) RETURNING id`,[deviceId,vehicleId]);
}
