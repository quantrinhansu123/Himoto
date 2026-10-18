BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE himoto.management_record_photos DROP CONSTRAINT IF EXISTS management_record_photos_slots;
ALTER TABLE himoto.management_record_photos ADD CONSTRAINT management_record_photos_slots CHECK(
  (entity_type='customers' AND slot IN('id_front','id_back','driver_license')) OR
  (entity_type='contracts' AND (slot IN('driver-license','customer-id-front','customer-id-back','customer-driver-license') OR slot ~ '^plate-[1-9][0-9]{0,14}$' OR
    slot ~ '^(rental|handover)-([1-9][0-9]{0,14}|video-[1-3]|document-[1-9][0-9]{0,14})$' OR
    slot ~ '^(return|renewal|renewal-receipt)-[1-9][0-9]{0,14}-([1-9][0-9]{0,14}|video-[1-3]|document-[1-9][0-9]{0,14})$' OR
    slot ~ '^battery-swap-[1-9][0-9]{0,14}-([12]|video-1|document-[1-9][0-9]{0,14})$'))
);
ALTER TABLE himoto.management_contract_telegram_preferences ALTER COLUMN auto_enabled SET DEFAULT false;
UPDATE himoto.management_contract_telegram_preferences SET auto_enabled=false WHERE auto_enabled;
-- Preserve snapshots, sent/unknown/partial deliveries, and requests explicitly sent by an operator.
UPDATE himoto.management_contract_notifications SET status='manual'
WHERE delivery_mode='auto' AND status IN('pending','awaiting_config');
-- Also hold events queued by an older deployment while the new deployment rolls out.
CREATE OR REPLACE FUNCTION himoto.hold_automatic_contract_notification() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.delivery_mode='auto' AND NEW.status='pending' THEN NEW.status='manual'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hold_automatic_contract_notification ON himoto.management_contract_notifications;
CREATE TRIGGER hold_automatic_contract_notification BEFORE INSERT OR UPDATE OF status ON himoto.management_contract_notifications
FOR EACH ROW EXECUTE FUNCTION himoto.hold_automatic_contract_notification();
COMMIT;
