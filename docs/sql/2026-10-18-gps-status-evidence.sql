BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE himoto.gps_devices
  ADD COLUMN IF NOT EXISTS provider_reported_at timestamptz,
  ADD COLUMN IF NOT EXISTS position_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_ignition boolean;
COMMIT;
