BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS himoto.management_gps_accounts (
  id uuid PRIMARY KEY,provider text NOT NULL CHECK(provider IN('protrack','iopgps')),label text NOT NULL,
  username text NOT NULL,secret_cipher text NOT NULL,enabled boolean NOT NULL DEFAULT true,
  session_cipher text,session_expires_at timestamptz,last_attempt_at timestamptz,last_success_at timestamptz,
  last_error text,device_count integer NOT NULL DEFAULT 0,updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,username)
);
ALTER TABLE himoto.management_gps_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_gps_accounts FROM PUBLIC,anon,authenticated,himoto_scoped;

ALTER TABLE himoto.gps_devices
  ADD COLUMN IF NOT EXISTS management_status text CHECK(management_status IN('online','stopped','offline','warning')),
  ADD COLUMN IF NOT EXISTS provider_device_name text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_latitude numeric,
  ADD COLUMN IF NOT EXISTS last_longitude numeric,
  ADD COLUMN IF NOT EXISTS last_speed numeric;

CREATE TABLE IF NOT EXISTS himoto.management_gps_status_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gps_device_id bigint NOT NULL REFERENCES himoto.gps_devices(id),vehicle_id bigint,
  from_status text,to_status text NOT NULL,observed_at timestamptz NOT NULL DEFAULT now(),
  provider_recorded_at timestamptz,provider_status text NOT NULL
);
CREATE INDEX IF NOT EXISTS management_gps_events_device_idx ON himoto.management_gps_status_events(gps_device_id,id DESC);
ALTER TABLE himoto.management_gps_status_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON himoto.management_gps_status_events TO himoto_scoped;
DROP POLICY IF EXISTS gps_status_event_read ON himoto.management_gps_status_events;
CREATE POLICY gps_status_event_read ON himoto.management_gps_status_events FOR SELECT TO himoto_scoped
  USING(EXISTS(SELECT 1 FROM himoto.vehicles v WHERE v.id=vehicle_id));

CREATE TABLE IF NOT EXISTS himoto.management_telegram_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),bot_cipher text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO himoto.management_telegram_settings(singleton) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE himoto.management_telegram_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_telegram_settings FROM PUBLIC,anon,authenticated,himoto_scoped;
CREATE TABLE IF NOT EXISTS himoto.management_store_telegram (
  store_id bigint PRIMARY KEY REFERENCES himoto.stores(id),chat_id text NOT NULL,
  thread_id integer,enabled boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE himoto.management_store_telegram ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_store_telegram FROM PUBLIC,anon,authenticated,himoto_scoped;
CREATE TABLE IF NOT EXISTS himoto.management_contract_notifications (
  id uuid PRIMARY KEY,order_id bigint NOT NULL REFERENCES himoto.orders(id),store_id bigint NOT NULL REFERENCES himoto.stores(id),
  event_key text NOT NULL UNIQUE,event_type text NOT NULL CHECK(event_type IN('rental','reservation','handover','return')),
  payload jsonb NOT NULL,photo_slots jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'awaiting_config' CHECK(status IN('awaiting_config','pending','sending','sent','failed','unknown')),
  message_ids jsonb NOT NULL DEFAULT '[]',error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS management_contract_notifications_pending_idx ON himoto.management_contract_notifications(status,created_at);
ALTER TABLE himoto.management_contract_notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON himoto.management_contract_notifications TO himoto_scoped;
DROP POLICY IF EXISTS contract_notification_gate ON himoto.management_contract_notifications;
DROP POLICY IF EXISTS contract_notification_scope ON himoto.management_contract_notifications;
CREATE POLICY contract_notification_gate ON himoto.management_contract_notifications TO himoto_scoped USING(true) WITH CHECK(true);
CREATE POLICY contract_notification_scope ON himoto.management_contract_notifications AS RESTRICTIVE TO himoto_scoped
  USING(himoto.access_store(store_id)) WITH CHECK(himoto.access_store(store_id));

DO $$ DECLARE constraint_name text; BEGIN
  FOR constraint_name IN SELECT conname FROM pg_constraint WHERE conrelid='himoto.management_record_photos'::regclass
    AND contype='c' AND pg_get_constraintdef(oid) LIKE '%plate-%'
  LOOP EXECUTE format('ALTER TABLE himoto.management_record_photos DROP CONSTRAINT %I',constraint_name); END LOOP;
END $$;
ALTER TABLE himoto.management_record_photos ADD CONSTRAINT management_record_photos_slots CHECK(
  (entity_type='customers' AND slot IN('id_front','id_back')) OR
  (entity_type='contracts' AND (slot ~ '^plate-[1-9][0-9]{0,14}$' OR slot ~ '^(rental|handover)-[1-6]$' OR slot ~ '^return-[1-9][0-9]{0,14}-[1-6]$'))
);
COMMIT;
