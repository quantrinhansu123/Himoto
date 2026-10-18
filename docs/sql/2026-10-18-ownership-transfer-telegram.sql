BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE himoto.management_contract_notifications ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE himoto.management_contract_notifications ADD COLUMN IF NOT EXISTS vehicle_event_id bigint REFERENCES himoto.vehicle_location_events(id);
ALTER TABLE himoto.management_contract_notifications DROP CONSTRAINT IF EXISTS management_contract_notifications_event_type_check;
ALTER TABLE himoto.management_contract_notifications ADD CONSTRAINT management_contract_notifications_event_type_check
  CHECK(event_type IN ('rental','reservation','handover','return','renewal','battery_swap','vehicle_transfer','vehicle_receive'));
ALTER TABLE himoto.management_contract_notifications DROP CONSTRAINT IF EXISTS management_contract_notifications_subject_check;
ALTER TABLE himoto.management_contract_notifications ADD CONSTRAINT management_contract_notifications_subject_check CHECK(
  (order_id IS NOT NULL AND vehicle_event_id IS NULL AND event_type NOT IN ('vehicle_transfer','vehicle_receive')) OR
  (order_id IS NULL AND vehicle_event_id IS NOT NULL AND event_type IN ('vehicle_transfer','vehicle_receive'))
);
CREATE UNIQUE INDEX IF NOT EXISTS management_contract_notifications_vehicle_event_key
  ON himoto.management_contract_notifications(vehicle_event_id) WHERE vehicle_event_id IS NOT NULL;
-- Transfer previews/submissions use the server endpoint's explicit two-branch authorization.
DROP POLICY IF EXISTS vehicle_notification_server_only ON himoto.management_contract_notifications;
CREATE POLICY vehicle_notification_server_only ON himoto.management_contract_notifications AS RESTRICTIVE TO himoto_scoped
  USING(vehicle_event_id IS NULL) WITH CHECK(vehicle_event_id IS NULL);
COMMIT;
