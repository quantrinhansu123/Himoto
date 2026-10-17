BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE himoto.management_contract_notifications
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'auto' CHECK(delivery_mode IN('auto','manual')),
  ADD COLUMN IF NOT EXISTS root_event_key text,
  ADD COLUMN IF NOT EXISTS photo_phases jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE himoto.management_contract_notifications DROP CONSTRAINT IF EXISTS management_contract_notifications_event_type_check;
ALTER TABLE himoto.management_contract_notifications ADD CONSTRAINT management_contract_notifications_event_type_check
  CHECK(event_type IN('rental','reservation','handover','return','renewal'));
ALTER TABLE himoto.management_contract_notifications DROP CONSTRAINT IF EXISTS management_contract_notifications_status_check;
ALTER TABLE himoto.management_contract_notifications ADD CONSTRAINT management_contract_notifications_status_check
  CHECK(status IN('manual','awaiting_config','pending','sending','sent','failed','unknown'));
CREATE INDEX IF NOT EXISTS contract_notice_root_idx ON himoto.management_contract_notifications(order_id,root_event_key,created_at DESC);
CREATE TABLE IF NOT EXISTS himoto.management_contract_telegram_preferences (
  order_id bigint PRIMARY KEY REFERENCES himoto.orders(id),store_id bigint NOT NULL REFERENCES himoto.stores(id),
  auto_enabled boolean NOT NULL DEFAULT true,updated_by bigint NOT NULL REFERENCES himoto.users(id),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE himoto.management_contract_telegram_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON himoto.management_contract_telegram_preferences TO himoto_scoped;
DROP POLICY IF EXISTS contract_telegram_preference_scope ON himoto.management_contract_telegram_preferences;
CREATE POLICY contract_telegram_preference_scope ON himoto.management_contract_telegram_preferences TO himoto_scoped
  USING(himoto.access_store(store_id) AND EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=order_id AND o.store_id=management_contract_telegram_preferences.store_id AND o.deleted_at IS NULL))
  WITH CHECK(himoto.access_store(store_id) AND EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=order_id AND o.store_id=management_contract_telegram_preferences.store_id AND o.deleted_at IS NULL));
ALTER TABLE himoto.management_record_photos DROP CONSTRAINT IF EXISTS management_record_photos_slots;
ALTER TABLE himoto.management_record_photos ADD CONSTRAINT management_record_photos_slots CHECK(
  (entity_type='customers' AND slot IN('id_front','id_back')) OR
  (entity_type='contracts' AND (slot ~ '^plate-[1-9][0-9]{0,14}$' OR slot ~ '^(rental|handover)-[1-6]$' OR slot ~ '^(return|renewal|renewal-receipt)-[1-9][0-9]{0,14}-[1-6]$'))
);
COMMIT;
