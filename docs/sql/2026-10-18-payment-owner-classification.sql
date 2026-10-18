BEGIN;
SET LOCAL lock_timeout='5s';
-- Preserve an audit of historical classification repairs. Never infer ownership
-- from a current bank setting or alter receipt amounts, accounts or dates.
CREATE TABLE IF NOT EXISTS himoto.management_payment_classification_repairs(
  transaction_id bigint PRIMARY KEY,
  previous_owner_type text,
  corrected_owner_type text NOT NULL CHECK(corrected_owner_type IN('personal','company')),
  evidence text NOT NULL,
  repaired_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE himoto.management_payment_classification_repairs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_payment_classification_repairs FROM PUBLIC,anon,authenticated,himoto_scoped;
WITH evidence AS (
  SELECT t.id,t.bank_owner_type,
    CASE WHEN t.name='order:deposit' OR t.name LIKE 'order:deposit:%'
      THEN o.draft_payload #>> '{management_composer,draft,deposit_payment_method}'
      ELSE o.draft_payload #>> '{management_composer,draft,payment_method}' END AS chosen_method
  FROM himoto.transactions t JOIN himoto.orders o ON o.id=t.order_id
  WHERE t.status='approved' AND t.type IN('in','addon') AND t.bank_id IS NOT NULL AND t.cash_id IS NULL
    AND COALESCE(t.bank_owner_type,'unknown') NOT IN('personal','company')
    AND (t.name='order:rental_fees' OR t.name='order:deposit' OR t.name LIKE 'order:deposit:%')
    AND (o.draft_payload::jsonb #> '{management_composer,finalized,transaction_ids}') @> jsonb_build_array(t.id)
), certain AS (
  SELECT *,CASE WHEN chosen_method IN('CK tk cá nhân','CK tài khoản cá nhân') THEN 'personal'
    WHEN chosen_method IN('CK tk công ty','CK tài khoản công ty') THEN 'company' END AS corrected
  FROM evidence
), logged AS (
  INSERT INTO himoto.management_payment_classification_repairs(transaction_id,previous_owner_type,corrected_owner_type,evidence)
  SELECT id,bank_owner_type,corrected,chosen_method FROM certain WHERE corrected IS NOT NULL
  ON CONFLICT(transaction_id) DO NOTHING RETURNING *
)
UPDATE himoto.transactions t SET bank_owner_type=logged.corrected_owner_type
FROM logged WHERE t.id=logged.transaction_id AND t.bank_owner_type IS NOT DISTINCT FROM logged.previous_owner_type;
COMMIT;
