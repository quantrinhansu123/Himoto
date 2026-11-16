-- Run each statement outside a transaction. Retain the existing indexes:
-- their device/source uniqueness and stop-evidence readers still use them.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gps_events_event_time_id
ON himoto.management_gps_status_events
((CASE WHEN source='poll' THEN observed_at ELSE COALESCE(provider_recorded_at,observed_at) END) DESC,id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gps_events_vehicle_event_time_id
ON himoto.management_gps_status_events
(vehicle_id,(CASE WHEN source='poll' THEN observed_at ELSE COALESCE(provider_recorded_at,observed_at) END) DESC,id DESC);
