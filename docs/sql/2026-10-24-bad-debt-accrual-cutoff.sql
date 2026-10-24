BEGIN;
SET LOCAL lock_timeout='5s';
-- Known transitions retain their actual timestamp. Imported records without a
-- transition are frozen at this migration, without inventing a historical date.
WITH anchors AS (
  SELECT o.id,CASE WHEN jsonb_typeof(o.draft_payload::jsonb)='object' THEN o.draft_payload::jsonb ELSE '{}'::jsonb END AS payload,
    COALESCE((SELECT event->>'at' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.draft_payload::jsonb #> '{management_composer,lifecycle,events}')='array' THEN o.draft_payload::jsonb #> '{management_composer,lifecycle,events}' ELSE '[]'::jsonb END) WITH ORDINALITY h(event,n)
      WHERE event->>'action'='mark_bad_debt' ORDER BY n DESC LIMIT 1),to_char(clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD"T"HH24:MI:SS')||'+07:00') AS cutoff
  FROM himoto.orders o WHERE o.order_status='bad_debt' AND o.deleted_at IS NULL
    AND o.draft_payload #>> '{management_composer,lifecycle,bad_debt,at}' IS NULL FOR UPDATE
), snapshots AS (
  SELECT id,payload,cutoff,
    COALESCE(payload->'management_composer','{}'::jsonb) AS composer,
    COALESCE(payload #> '{management_composer,lifecycle}','{}'::jsonb) AS lifecycle FROM anchors
)
UPDATE himoto.orders o SET draft_payload=jsonb_set(s.payload,'{management_composer}',
  s.composer||jsonb_build_object('lifecycle',s.lifecycle||jsonb_build_object('bad_debt',jsonb_build_object(
    'at',s.cutoff,'recorded_at',clock_timestamp(),'source','bad_debt_cutoff_backfill'))))::json
FROM snapshots s WHERE o.id=s.id;
COMMIT;
