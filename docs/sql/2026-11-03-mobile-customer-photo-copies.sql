-- Metadata only. Apply as owner after mobile-writes and record-photo/RLS setup.
-- No customer/order/photo backfill and no expiry of recovery proofs.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS himoto.management_mobile_customer_photo_copies (
  user_id bigint NOT NULL,
  request_id uuid NOT NULL,
  order_id bigint NOT NULL,
  proof jsonb NOT NULL CHECK(jsonb_typeof(proof)='object' AND octet_length(proof::text)<=16384),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,request_id),
  FOREIGN KEY(user_id,request_id) REFERENCES himoto.management_mobile_requests(user_id,request_id)
);
ALTER TABLE himoto.management_mobile_customer_photo_copies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_mobile_customer_photo_copies FROM PUBLIC,anon,authenticated,himoto_scoped;
GRANT SELECT,INSERT ON himoto.management_mobile_customer_photo_copies TO himoto_scoped;
DROP POLICY IF EXISTS mobile_customer_photo_copy_actor ON himoto.management_mobile_customer_photo_copies;
CREATE POLICY mobile_customer_photo_copy_actor ON himoto.management_mobile_customer_photo_copies TO himoto_scoped
  USING(user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint)
  WITH CHECK(user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint AND
    EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=order_id AND o.deleted_at IS NULL));
CREATE INDEX IF NOT EXISTS management_mobile_customer_photo_copies_order_idx ON himoto.management_mobile_customer_photo_copies(order_id);
COMMIT;
