BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION himoto.contract_number_available(target text,excluded_order bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
  SELECT target IS NOT NULL AND length(target) BETWEEN 1 AND 32 AND NOT EXISTS(
    SELECT 1 FROM himoto.orders WHERE (contract_number=target OR draft_reference=target)
      AND (excluded_order IS NULL OR id<>excluded_order))
$$;
REVOKE ALL ON FUNCTION himoto.contract_number_available(text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.contract_number_available(text,bigint) TO himoto_scoped;
COMMIT;
