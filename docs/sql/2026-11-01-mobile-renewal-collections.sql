-- Owner migration after mobile-writes.sql, mobile-bills.sql and mobile-renewals.sql.
-- Immutable acknowledgements; no operational rows or existing receipt policies change.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS himoto.management_mobile_renewal_collections (
  user_id bigint NOT NULL,
  request_id uuid NOT NULL,
  order_id bigint NOT NULL REFERENCES himoto.orders(id),
  renewal_version bigint NOT NULL CHECK(renewal_version BETWEEN 2 AND 999999999999999),
  -- No FK to mutable cashbook rows: a later authorised deletion/correction must
  -- not erase this original result or be blocked by acknowledgement metadata.
  transaction_id bigint NOT NULL CHECK(transaction_id>0),
  item_id bigint NOT NULL CHECK(item_id>0),
  vehicle_id bigint NOT NULL CHECK(vehicle_id>0),
  before_return_at timestamptz,
  return_at timestamptz NOT NULL,
  period_created_at timestamptz,
  period_amount bigint NOT NULL CHECK(period_amount BETWEEN 0 AND 9999999999999),
  collected_before bigint NOT NULL CHECK(collected_before>=0),
  amount bigint NOT NULL CHECK(amount>0),
  method varchar(24) NOT NULL CHECK(method IN('cash','transfer','company_transfer')),
  account_id bigint NOT NULL CHECK(account_id>0),
  paid_at timestamptz NOT NULL,
  bill_revision varchar(32) NOT NULL CHECK(bill_revision ~ '^[1-9][0-9]{0,19}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,request_id),
  FOREIGN KEY(user_id,request_id) REFERENCES himoto.management_mobile_requests(user_id,request_id),
  CHECK(collected_before+amount<=period_amount),
  CHECK(before_return_at IS NOT NULL OR period_created_at IS NOT NULL)
);
ALTER TABLE himoto.management_mobile_renewal_collections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_mobile_renewal_collections FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON himoto.management_mobile_renewal_collections TO himoto_scoped;
DROP POLICY IF EXISTS mobile_renewal_collections_actor ON himoto.management_mobile_renewal_collections;
CREATE POLICY mobile_renewal_collections_actor ON himoto.management_mobile_renewal_collections TO himoto_scoped
  USING(user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint)
  WITH CHECK(user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint);
CREATE INDEX IF NOT EXISTS management_mobile_renewal_collections_order_idx ON himoto.management_mobile_renewal_collections(order_id,renewal_version);
COMMIT;
