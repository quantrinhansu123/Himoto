export const BAD_DEBT_CLOSED_AT_SQL="CASE WHEN o.order_status='completed' THEN COALESCE(o.draft_payload #>> '{management_composer,lifecycle,bad_debt_closure,at}',o.draft_payload #>> '{management_composer,lifecycle,payment_closure,at}') END";
export const PAYMENT_CLOSURE_TOTAL_SQL="CASE WHEN o.order_status='completed' THEN o.draft_payload #>> '{management_composer,lifecycle,payment_closure,total}' END";
export const BAD_DEBT_CUTOFF_SQL=`CASE WHEN o.order_status='bad_debt' OR (${BAD_DEBT_CLOSED_AT_SQL}) IS NOT NULL THEN COALESCE(o.draft_payload #>> '{management_composer,lifecycle,bad_debt,at}',
  (SELECT event->>'at' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.draft_payload::jsonb #> '{management_composer,lifecycle,events}')='array'
    THEN o.draft_payload::jsonb #> '{management_composer,lifecycle,events}' ELSE '[]'::jsonb END) WITH ORDINALITY AS history(event,ordinal)
    WHERE event->>'action'='mark_bad_debt' ORDER BY ordinal DESC LIMIT 1),o.draft_payload #>> '{management_composer,lifecycle,payment_closure,at}') ELSE NULL END`;
