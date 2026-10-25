BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE himoto.gps_devices ADD COLUMN IF NOT EXISTS provider_stopped_since timestamptz;
COMMENT ON COLUMN himoto.gps_devices.provider_stopped_since IS 'Provider stop-status start, separate from local stopped_since observations; never ACC duration or position timestamp.';
-- Indexed lookups reject provider duration contradicted by known motion.
CREATE INDEX IF NOT EXISTS gps_motion_stop_evidence ON himoto.management_gps_status_events
  (gps_device_id,(CASE WHEN source='poll' THEN observed_at ELSE provider_recorded_at END) DESC)
  WHERE event_kind='motion' AND to_status='online';
COMMIT;
