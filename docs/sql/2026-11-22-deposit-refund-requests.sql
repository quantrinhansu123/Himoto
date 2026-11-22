BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS himoto.management_deposit_refund_requests (
  id uuid PRIMARY KEY,
  order_id bigint NOT NULL,
  item_id bigint NOT NULL,
  store_id bigint NOT NULL,
  created_by bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  request_hash text NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('cash','transfer','company_transfer')),
  account_id bigint NOT NULL,
  account_label text NOT NULL,
  paid_at timestamp NOT NULL,
  reason text NOT NULL,
  evidence bytea NOT NULL CHECK (octet_length(evidence) BETWEEN 1 AND 2097152),
  replaces_id bigint,
  replaces_revision text,
  refund_snapshot text NOT NULL,
  review_reason text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','posted','approved','rejected')),
  reviewed_by bigint,
  reviewed_at timestamptz,
  review_note text,
  transaction_id bigint,
  CHECK ((replaces_id IS NULL) = (replaces_revision IS NULL)),
  CHECK ((status IN ('posted','approved')) = (transaction_id IS NOT NULL)),
  CHECK ((status IN ('approved','rejected')) = (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS management_refund_one_pending
  ON himoto.management_deposit_refund_requests(order_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS management_refund_queue
  ON himoto.management_deposit_refund_requests(created_at, id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS management_refund_order_history
  ON himoto.management_deposit_refund_requests(order_id, created_at DESC);

ALTER TABLE himoto.management_deposit_refund_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_deposit_refund_requests FROM PUBLIC;
DROP POLICY IF EXISTS deposit_refund_scope ON himoto.management_deposit_refund_requests;
CREATE POLICY deposit_refund_scope ON himoto.management_deposit_refund_requests TO himoto_scoped
  USING (himoto.access_order_store(store_id))
  WITH CHECK (himoto.access_order_store(store_id));
GRANT SELECT, INSERT ON himoto.management_deposit_refund_requests TO himoto_scoped;
GRANT UPDATE (status, reviewed_by, reviewed_at, review_note, transaction_id)
  ON himoto.management_deposit_refund_requests TO himoto_scoped;
COMMIT;
