BEGIN;
CREATE TABLE IF NOT EXISTS himoto.management_contract_anomalies (
  transaction_id bigint PRIMARY KEY,
  order_id bigint NOT NULL,
  store_id bigint NOT NULL,
  actor_id bigint NOT NULL,
  contract_code text NOT NULL,
  kind text NOT NULL CHECK (kind = 'early_rental_refund_overage'),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  amount bigint NOT NULL,
  expected_amount bigint NOT NULL CHECK (expected_amount >= 0),
  CHECK (amount > expected_amount)
);
CREATE INDEX IF NOT EXISTS management_contract_anomalies_store_date
  ON himoto.management_contract_anomalies (store_id, occurred_at DESC, transaction_id DESC);
CREATE INDEX IF NOT EXISTS management_contract_anomalies_date
  ON himoto.management_contract_anomalies (occurred_at DESC, transaction_id DESC);
ALTER TABLE himoto.management_contract_anomalies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_contract_anomalies FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON himoto.management_contract_anomalies TO himoto_scoped;
DROP POLICY IF EXISTS contract_anomaly_read ON himoto.management_contract_anomalies;
CREATE POLICY contract_anomaly_read ON himoto.management_contract_anomalies FOR SELECT TO himoto_scoped
  USING (himoto.access_order_store(store_id));
DROP POLICY IF EXISTS contract_anomaly_insert ON himoto.management_contract_anomalies;
CREATE POLICY contract_anomaly_insert ON himoto.management_contract_anomalies FOR INSERT TO himoto_scoped
  WITH CHECK (actor_id = himoto.access_actor() AND himoto.access_order_store(store_id));
COMMIT;
