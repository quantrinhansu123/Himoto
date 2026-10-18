BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS himoto.management_ownership_telegram (
  route text PRIMARY KEY CHECK(route IN ('ownership_new','ownership_renewal')),
  chat_id text NOT NULL CHECK(chat_id ~ '^-[0-9]{5,18}$'),
  thread_id integer CHECK(thread_id>0),
  enabled boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE himoto.management_ownership_telegram ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_ownership_telegram FROM PUBLIC,anon,authenticated,himoto_scoped;
COMMIT;
