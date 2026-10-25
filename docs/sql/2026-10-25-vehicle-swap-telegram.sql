BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE himoto.management_contract_notifications DROP CONSTRAINT IF EXISTS management_contract_notifications_event_type_check;
ALTER TABLE himoto.management_contract_notifications ADD CONSTRAINT management_contract_notifications_event_type_check
  CHECK(event_type IN ('rental','reservation','handover','return','renewal','battery_swap','vehicle_swap','vehicle_transfer','vehicle_receive'));
COMMIT;
