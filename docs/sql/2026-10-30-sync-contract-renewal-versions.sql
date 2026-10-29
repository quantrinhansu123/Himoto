-- Sync missing contract renewal versions from management_contract_payments.renewal_payload
-- into orders.draft_payload.management_composer.versions so all contracts have complete
-- version history and photo validations match across server and client.

BEGIN;

UPDATE himoto.orders o
SET draft_payload = (
  COALESCE(draft_payload::jsonb, '{}'::jsonb) ||
  jsonb_build_object(
    'management_composer',
    COALESCE(draft_payload::jsonb->'management_composer', '{}'::jsonb) ||
    jsonb_build_object(
      'versions',
      (
        SELECT COALESCE(jsonb_agg(v ORDER BY (v->>'version')::int), '[]'::jsonb)
        FROM (
          SELECT v FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(o.draft_payload::jsonb #> '{management_composer,versions}') = 'array'
                 THEN o.draft_payload::jsonb #> '{management_composer,versions}'
                 ELSE '[]'::jsonb END
          ) AS v
          UNION ALL
          SELECT p.renewal_payload::jsonb AS v
          FROM himoto.management_contract_payments p
          WHERE p.order_id = o.id AND p.renewal_payload IS NOT NULL
            AND (p.renewal_payload->>'version') IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(o.draft_payload::jsonb #> '{management_composer,versions}') = 'array'
                     THEN o.draft_payload::jsonb #> '{management_composer,versions}'
                     ELSE '[]'::jsonb END
              ) existing
              WHERE (existing->>'version')::text = (p.renewal_payload->>'version')::text
            )
        ) combined
      )
    )
  )
)::json,
updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM himoto.management_contract_payments p
  WHERE p.order_id = o.id AND p.renewal_payload IS NOT NULL
    AND (p.renewal_payload->>'version') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(o.draft_payload::jsonb #> '{management_composer,versions}') = 'array'
             THEN o.draft_payload::jsonb #> '{management_composer,versions}'
             ELSE '[]'::jsonb END
      ) existing
      WHERE (existing->>'version')::text = (p.renewal_payload->>'version')::text
    )
);

COMMIT;
