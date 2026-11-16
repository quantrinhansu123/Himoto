import 'server-only';
import type { PoolClient } from 'pg';

type Database = Pick<PoolClient, 'query'>;
const fields = `e.id,e.vehicle_id,e.from_status,e.to_status,e.observed_at,e.event_kind,e.source,
  CASE WHEN e.source='poll' THEN e.observed_at ELSE COALESCE(e.provider_recorded_at,e.observed_at) END AS event_at,
  COALESCE(v.license,d.provider_device_name,d.external_device_id) AS license`;

/** Filters and RLS apply before every LIMIT. Event vehicle_id remains the
 * historical association, independent of a device's current mapping. */
export function readGpsEvents(db: Database, store: string, source: string, device: string) {
  const values = [store === 'all' ? null : Number(store), source === 'all' ? null : source, device ? Number(device) : null];
  if (store === 'all' || device) {
    return db.query(`SELECT ${fields}
      FROM himoto.management_gps_status_events e JOIN himoto.gps_devices d ON d.id=e.gps_device_id
      LEFT JOIN himoto.vehicles v ON v.id=e.vehicle_id
      WHERE ($1::bigint IS NULL OR COALESCE(v.current_store_id,v.store_id)=$1)
        AND ($2::text IS NULL OR e.source=$2) AND ($3::bigint IS NULL OR e.gps_device_id=$3)
      ORDER BY event_at DESC,e.id DESC LIMIT 100`, values);
  }
  // The global top 100 is contained in the union of each eligible vehicle's
  // top 100. Bound history work before joining/sorting the whole fleet.
  return db.query(`SELECT recent.* FROM himoto.vehicles v CROSS JOIN LATERAL (
      SELECT ${fields} FROM himoto.management_gps_status_events e
      JOIN himoto.gps_devices d ON d.id=e.gps_device_id
      WHERE e.vehicle_id=v.id AND ($2::text IS NULL OR e.source=$2)
        AND ($3::bigint IS NULL OR e.gps_device_id=$3)
      ORDER BY event_at DESC,e.id DESC LIMIT 100
    ) recent WHERE COALESCE(v.current_store_id,v.store_id)=$1::bigint
    ORDER BY recent.event_at DESC,recent.id DESC LIMIT 100`, values);
}

export function readGpsEventOptions(db: Database, store: string) {
  return db.query(`SELECT d.id,COALESCE(NULLIF(v.license,''),NULLIF(d.provider_device_name,''),d.external_device_id) AS label
    FROM himoto.gps_devices d LEFT JOIN himoto.vehicles v ON v.id=d.vehicle_id
    LEFT JOIN himoto.management_gps_accounts a ON a.id=d.source_account_id
    WHERE (d.vehicle_id IS NULL OR v.id IS NOT NULL AND v.deleted_at IS NULL)
      AND ($1::bigint IS NULL OR COALESCE(v.current_store_id,v.store_id)=$1)
    ORDER BY CASE WHEN d.provider_status='not_visible_in_account' THEN d.sync_received_at
      ELSE COALESCE(a.last_success_at,d.sync_received_at) END DESC NULLS LAST,d.id DESC`, [store === 'all' ? null : Number(store)]);
}
