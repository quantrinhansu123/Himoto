import 'server-only';

// List, selected-contract vehicles and return screens must choose the same device.
export const VEHICLE_GPS_JOIN_SQL = `LEFT JOIN LATERAL (
  SELECT true AS has_device,g.id AS device_id,
    CASE WHEN g.provider_status='not_visible_in_account' THEN 'unavailable'
      WHEN COALESCE(a.last_success_at,g.sync_received_at) IS NULL OR COALESCE(a.last_success_at,g.sync_received_at)<now()-interval '10 minutes' THEN 'stale'
      ELSE g.management_status END AS normalized_status,
    g.heartbeat_at,g.provider_reported_at,g.position_recorded_at,g.last_ignition,g.provider_status,
    g.last_latitude AS latitude,g.last_longitude AS longitude,g.provider,
    CASE WHEN g.provider_status='not_visible_in_account' THEN g.sync_received_at ELSE COALESCE(a.last_success_at,g.sync_received_at) END AS synced_at,
    g.position_recorded_at AS last_at
  FROM himoto.gps_devices g LEFT JOIN himoto.management_gps_accounts a ON a.id=g.source_account_id
  WHERE g.vehicle_id=v.id
  ORDER BY (g.provider_status IS DISTINCT FROM 'not_visible_in_account') DESC,
    COALESCE(a.last_success_at,g.sync_received_at) DESC NULLS LAST,g.heartbeat_at DESC NULLS LAST,g.id DESC LIMIT 1
) gps ON true`;
