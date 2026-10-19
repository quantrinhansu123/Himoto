BEGIN;
SET LOCAL lock_timeout = '5s';
-- One transfer/receive event may enqueue both the ownership group and the physical branch group.
DROP INDEX IF EXISTS himoto.management_contract_notifications_vehicle_event_key;
CREATE UNIQUE INDEX IF NOT EXISTS management_contract_notifications_vehicle_event_key
  ON himoto.management_contract_notifications(vehicle_event_id, event_key)
  WHERE vehicle_event_id IS NOT NULL;
COMMIT;
