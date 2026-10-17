BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS himoto.management_debt_reminders (
  request_id uuid PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES himoto.orders(id),
  store_id bigint NOT NULL REFERENCES himoto.stores(id),
  actor_id bigint NOT NULL REFERENCES himoto.users(id),
  fingerprint text NOT NULL,
  contract_code text NOT NULL, customer_name text NOT NULL, phone text NOT NULL,
  message text NOT NULL CHECK(length(message) BETWEEN 1 AND 4000),
  amount bigint NOT NULL CHECK(amount>0),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','failed','unknown')),
  provider_status integer,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS management_debt_reminders_store_idx ON himoto.management_debt_reminders(store_id,created_at DESC);
CREATE INDEX IF NOT EXISTS management_debt_reminders_order_idx ON himoto.management_debt_reminders(order_id,created_at DESC);
ALTER TABLE himoto.management_debt_reminders ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON himoto.management_debt_reminders TO himoto_scoped;
DROP POLICY IF EXISTS debt_reminder_gate ON himoto.management_debt_reminders;
CREATE POLICY debt_reminder_gate ON himoto.management_debt_reminders TO himoto_scoped USING(true) WITH CHECK(true);
DROP POLICY IF EXISTS debt_reminder_scope ON himoto.management_debt_reminders;
CREATE POLICY debt_reminder_scope ON himoto.management_debt_reminders AS RESTRICTIVE TO himoto_scoped
  USING(himoto.access_store(store_id)) WITH CHECK(himoto.access_store(store_id));

-- The webhook URL is a credential. Only the server's database owner can read it.
CREATE TABLE IF NOT EXISTS himoto.management_zalo_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  webhook_url text NOT NULL CHECK(webhook_url LIKE 'https://%'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE himoto.management_zalo_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_zalo_settings FROM PUBLIC,himoto_scoped;
COMMIT;
