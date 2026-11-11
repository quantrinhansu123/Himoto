BEGIN;
SET LOCAL search_path=pg_catalog,himoto;

-- SQL-standard bodies bind dependencies at definition time. Names keep their
-- trusted resolution even when a caller changes search_path. Keep both helpers
-- SECURITY INVOKER and retain their existing OIDs, owners and EXECUTE grants.
CREATE OR REPLACE FUNCTION himoto.access_store(target numeric)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
RETURN current_setting('himoto.scope_all',true)='true'
  OR target=NULLIF(current_setting('himoto.store_id',true),'')::bigint;

CREATE OR REPLACE FUNCTION himoto.access_order_store(target numeric)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
RETURN himoto.access_store(target)
  OR himoto.ownership_may_use_headquarters_customer_source(target::bigint);

-- Per-call SET prevents inlining. The privileged ownership helper retains its
-- own fixed search_path; this wrapper has no elevated privileges or table read.
ALTER FUNCTION himoto.access_order_store(numeric) RESET search_path;
COMMIT;
