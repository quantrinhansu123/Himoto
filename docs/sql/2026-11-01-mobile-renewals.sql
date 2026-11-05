-- Apply as owner after mobile-writes.sql and mobile-bills.sql. No operational rows are changed.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS himoto.management_mobile_renewals (
  user_id bigint NOT NULL,
  request_id uuid NOT NULL,
  order_id bigint NOT NULL REFERENCES himoto.orders(id),
  renewal_version bigint NOT NULL CHECK(renewal_version>=2),
  return_at timestamptz NOT NULL,
  amount bigint NOT NULL CHECK(amount BETWEEN 0 AND 9999999999999),
  total_amount bigint CHECK(total_amount BETWEEN 0 AND 9999999999999),
  collected boolean NOT NULL,
  method varchar(24),
  account_id bigint,
  paid_at timestamptz,
  transaction_id bigint,
  outside_amount bigint NOT NULL CHECK(outside_amount BETWEEN 0 AND 9999999999999),
  outside_transaction_id bigint,
  bill_revision varchar(32),
  warning varchar(4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,request_id),
  FOREIGN KEY(user_id,request_id) REFERENCES himoto.management_mobile_requests(user_id,request_id),
  CHECK(COALESCE((NOT collected AND method IS NULL AND account_id IS NULL AND paid_at IS NULL AND transaction_id IS NULL AND outside_transaction_id IS NULL AND bill_revision IS NULL OR
    collected AND method IN('cash','transfer','company_transfer') AND account_id>0 AND paid_at IS NOT NULL AND bill_revision ~ '^[1-9][0-9]{0,19}$' AND (amount>0 OR outside_amount>0) AND
    (amount=0 AND transaction_id IS NULL OR amount>0 AND transaction_id>0) AND
    (outside_amount=0 AND outside_transaction_id IS NULL OR outside_amount>0 AND outside_transaction_id>0)),false))
);
ALTER TABLE himoto.management_mobile_renewals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_mobile_renewals FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON himoto.management_mobile_renewals TO himoto_scoped;
-- Same-branch numbering must consider every saved version, including another
-- operator's unpaid renewal after legacy JSON history is reconciled/trimmed.
-- API receipt lookups still join the actor-only mobile request row explicitly.
DROP POLICY IF EXISTS mobile_renewals_actor ON himoto.management_mobile_renewals;
DROP POLICY IF EXISTS mobile_renewals_visible_read ON himoto.management_mobile_renewals;
CREATE POLICY mobile_renewals_visible_read ON himoto.management_mobile_renewals FOR SELECT TO himoto_scoped
  USING(user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint OR
    EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=order_id AND o.deleted_at IS NULL));
DROP POLICY IF EXISTS mobile_renewals_actor_insert ON himoto.management_mobile_renewals;
CREATE POLICY mobile_renewals_actor_insert ON himoto.management_mobile_renewals FOR INSERT TO himoto_scoped
  WITH CHECK(user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint);
CREATE INDEX IF NOT EXISTS management_mobile_renewals_order_idx ON himoto.management_mobile_renewals(order_id,renewal_version);
COMMIT;
