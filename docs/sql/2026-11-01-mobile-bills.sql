-- Apply as owner after mobile-writes.sql. No operational rows are changed.
-- Immutable receipt metadata; no photo bytes/form contents or bearer tokens.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS himoto.management_mobile_bills (
  user_id bigint NOT NULL,
  request_id uuid NOT NULL,
  order_id bigint NOT NULL REFERENCES himoto.orders(id),
  renewal_version bigint NOT NULL CHECK (renewal_version >= 2),
  slot varchar(100) NOT NULL,
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  photo_revision varchar(32) NOT NULL CHECK (photo_revision ~ '^[1-9][0-9]{0,19}$'),
  byte_count integer NOT NULL CHECK (byte_count BETWEEN 1 AND 2097152),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,request_id),
  FOREIGN KEY (user_id,request_id) REFERENCES himoto.management_mobile_requests(user_id,request_id)
);
ALTER TABLE himoto.management_mobile_bills ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_mobile_bills FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON himoto.management_mobile_bills TO himoto_scoped;
DROP POLICY IF EXISTS mobile_bills_actor ON himoto.management_mobile_bills;
CREATE POLICY mobile_bills_actor ON himoto.management_mobile_bills FOR ALL TO himoto_scoped
  USING (user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint)
  WITH CHECK (user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint);
CREATE INDEX IF NOT EXISTS management_mobile_bills_order_idx ON himoto.management_mobile_bills(order_id,renewal_version);
COMMIT;
