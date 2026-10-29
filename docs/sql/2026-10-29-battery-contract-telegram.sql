BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE himoto.management_contract_notifications
  ADD COLUMN IF NOT EXISTS battery_contract_id bigint REFERENCES himoto.battery_contracts(id);
ALTER TABLE himoto.management_contract_notifications DROP CONSTRAINT IF EXISTS management_contract_notifications_event_type_check;
ALTER TABLE himoto.management_contract_notifications ADD CONSTRAINT management_contract_notifications_event_type_check
  CHECK(event_type IN ('rental','reservation','handover','return','renewal','battery_swap','vehicle_swap','vehicle_transfer','vehicle_receive','battery_return','battery_renewal'));
ALTER TABLE himoto.management_contract_notifications DROP CONSTRAINT IF EXISTS management_contract_notifications_subject_check;
ALTER TABLE himoto.management_contract_notifications ADD CONSTRAINT management_contract_notifications_subject_check CHECK(
  (order_id IS NOT NULL AND vehicle_event_id IS NULL AND battery_contract_id IS NULL AND event_type NOT IN ('vehicle_transfer','vehicle_receive','battery_return','battery_renewal')) OR
  (order_id IS NULL AND vehicle_event_id IS NOT NULL AND battery_contract_id IS NULL AND event_type IN ('vehicle_transfer','vehicle_receive')) OR
  (order_id IS NULL AND vehicle_event_id IS NULL AND battery_contract_id IS NOT NULL AND event_type IN ('battery_return','battery_renewal'))
);
CREATE UNIQUE INDEX IF NOT EXISTS management_contract_notifications_battery_event_key
  ON himoto.management_contract_notifications(battery_contract_id, event_key)
  WHERE battery_contract_id IS NOT NULL;
DROP POLICY IF EXISTS battery_notification_server_only ON himoto.management_contract_notifications;
CREATE POLICY battery_notification_server_only ON himoto.management_contract_notifications AS RESTRICTIVE TO himoto_scoped
  USING(battery_contract_id IS NULL) WITH CHECK(battery_contract_id IS NULL);
COMMIT;
