-- Additive: existing history and legacy writers remain valid. No business rows are changed.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE himoto.vehicle_location_events ADD COLUMN IF NOT EXISTS audit_snapshot jsonb;
COMMENT ON COLUMN himoto.vehicle_location_events.audit_snapshot IS
  'Management audit v1: actor/vehicle/store name snapshots and field-level before/after changes, written atomically with the vehicle update.';
COMMIT;
