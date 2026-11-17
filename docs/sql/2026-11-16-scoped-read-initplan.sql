BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog,himoto;

-- Preserve the existing ownership/HQ rule instead of duplicating it. Only a
-- small store directory is checked; the array is then an uncorrelated initPlan
-- in each SELECT statement. No cross-request permission cache is involved.
CREATE OR REPLACE FUNCTION himoto.ownership_customer_source_store_ids()
RETURNS bigint[] LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,himoto
AS $$
  SELECT COALESCE(array_agg(s.id ORDER BY s.id),ARRAY[]::bigint[])
  FROM himoto.stores s
  WHERE himoto.ownership_may_use_headquarters_customer_source(s.id)
$$;
REVOKE ALL ON FUNCTION himoto.ownership_customer_source_store_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.ownership_customer_source_store_ids() TO himoto_scoped;

-- Refuse to overwrite an unrelated policy or change its command/roles/mode.
DO $$
DECLARE target text; rule record;
BEGIN
  FOREACH target IN ARRAY ARRAY['orders','transactions'] LOOP
    SELECT * INTO rule FROM pg_policies WHERE schemaname='himoto'
      AND tablename=target AND policyname='management_scoped_read';
    IF NOT FOUND OR rule.cmd<>'SELECT' OR rule.permissive<>'RESTRICTIVE'
      OR rule.roles<>ARRAY['himoto_scoped']::name[] OR rule.with_check IS NOT NULL
      OR (position('access_order_store' IN rule.qual)=0
        AND position('ownership_customer_source_store_ids' IN rule.qual)=0) THEN
      RAISE EXCEPTION 'Unexpected scoped read policy on %',target;
    END IF;
  END LOOP;
END
$$;

-- Only SELECT predicates change. Existing write policies and helpers stay
-- intact, including their ownership restrictions and per-row WITH CHECK.
ALTER POLICY management_scoped_read ON himoto.orders USING (
  himoto.access_store(store_id)
  OR store_id::bigint=ANY((SELECT himoto.ownership_customer_source_store_ids())::bigint[])
);
ALTER POLICY management_scoped_read ON himoto.transactions USING (
  himoto.access_store(store_id)
  OR store_id::bigint=ANY((SELECT himoto.ownership_customer_source_store_ids())::bigint[])
);
COMMIT;
