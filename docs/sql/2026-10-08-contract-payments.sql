BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS himoto.management_contract_payments (
  request_id uuid PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES himoto.orders(id),
  transaction_id bigint NOT NULL UNIQUE REFERENCES himoto.transactions(id),
  actor_id bigint NOT NULL REFERENCES himoto.users(id),
  request_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE himoto.management_contract_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_contract_payments FROM anon, authenticated;
COMMIT;
