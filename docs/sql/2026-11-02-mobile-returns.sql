-- Apply as owner after mobile-writes.sql. Immutable acknowledgements only.
-- Never delete these while a device may replay an unresolved request.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS himoto.management_mobile_returns (
  user_id bigint NOT NULL,
  request_id uuid NOT NULL,
  order_id bigint NOT NULL REFERENCES himoto.orders(id),
  proof jsonb NOT NULL CHECK(jsonb_typeof(proof)='object' AND octet_length(proof::text)<=524288),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,request_id),
  FOREIGN KEY(user_id,request_id) REFERENCES himoto.management_mobile_requests(user_id,request_id)
);
ALTER TABLE himoto.management_mobile_returns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_mobile_returns FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON himoto.management_mobile_returns TO himoto_scoped;
DROP POLICY IF EXISTS mobile_returns_actor ON himoto.management_mobile_returns;
CREATE POLICY mobile_returns_actor ON himoto.management_mobile_returns TO himoto_scoped
  USING(user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint)
  WITH CHECK(user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint AND
    EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=order_id AND o.deleted_at IS NULL));
CREATE INDEX IF NOT EXISTS management_mobile_returns_order_idx ON himoto.management_mobile_returns(order_id);
COMMIT;
