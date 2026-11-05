-- Apply as schema owner after 2026-11-01-ownership-hq-customer-source.sql.
-- These boolean metadata predicates are called by stores' own RLS policy.
-- Invoker execution re-enters that policy indefinitely for an HQ row.
-- Preserve the existing policy expressions and branch/ownership grants.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER FUNCTION himoto.actor_owns_lease_store() SECURITY DEFINER SET search_path=pg_catalog,himoto;
ALTER FUNCTION himoto.is_headquarters_store(bigint) SECURITY DEFINER SET search_path=pg_catalog,himoto;
ALTER FUNCTION himoto.ownership_may_use_headquarters_customer_source(bigint) SECURITY DEFINER SET search_path=pg_catalog,himoto;
REVOKE ALL ON FUNCTION himoto.actor_owns_lease_store(),himoto.is_headquarters_store(bigint),
  himoto.ownership_may_use_headquarters_customer_source(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.actor_owns_lease_store(),himoto.is_headquarters_store(bigint),
  himoto.ownership_may_use_headquarters_customer_source(bigint) TO himoto_scoped;
COMMIT;
