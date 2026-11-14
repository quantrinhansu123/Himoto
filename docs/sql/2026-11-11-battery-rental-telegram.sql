BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE himoto.management_contract_notifications DROP CONSTRAINT IF EXISTS management_contract_notifications_event_type_check;
ALTER TABLE himoto.management_contract_notifications ADD CONSTRAINT management_contract_notifications_event_type_check
  CHECK(event_type IN ('rental','reservation','handover','return','renewal','battery_swap','vehicle_swap','vehicle_transfer','vehicle_receive','battery_return','battery_renewal','battery_rental'));
ALTER TABLE himoto.management_contract_notifications DROP CONSTRAINT IF EXISTS management_contract_notifications_subject_check;
ALTER TABLE himoto.management_contract_notifications ADD CONSTRAINT management_contract_notifications_subject_check CHECK(
  (order_id IS NOT NULL AND vehicle_event_id IS NULL AND battery_contract_id IS NULL AND event_type NOT IN ('vehicle_transfer','vehicle_receive','battery_return','battery_renewal','battery_rental')) OR
  (order_id IS NULL AND vehicle_event_id IS NOT NULL AND battery_contract_id IS NULL AND event_type IN ('vehicle_transfer','vehicle_receive')) OR
  (order_id IS NULL AND vehicle_event_id IS NULL AND battery_contract_id IS NOT NULL AND event_type IN ('battery_return','battery_renewal','battery_rental'))
);
COMMIT;
