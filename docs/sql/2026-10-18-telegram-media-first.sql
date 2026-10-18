BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS himoto.management_telegram_delivery_leases (
  chat_id text NOT NULL,thread_id bigint NOT NULL DEFAULT 0,
  lease_id uuid NOT NULL,notice_id uuid NOT NULL,expires_at timestamptz NOT NULL,
  PRIMARY KEY(chat_id,thread_id)
);
REVOKE ALL ON himoto.management_telegram_delivery_leases FROM PUBLIC,himoto_scoped;
COMMIT;
