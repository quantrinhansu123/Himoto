-- Expose store.kind in company directory so ownership stock checks on the form
-- can recognize lease_to_own without relying only on the store name.
BEGIN;
SET LOCAL lock_timeout='5s';

DROP FUNCTION IF EXISTS himoto.store_directory();
CREATE FUNCTION himoto.store_directory() RETURNS TABLE(
  id bigint, store_name varchar, manager_user_id bigint, manager_name text,
  store_phone text, store_address text, kind text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
  SELECT s.id::bigint, s.store_name, s.user_id::bigint, u.name::text,
    COALESCE(s.store_phone, '')::text, COALESCE(s.store_address, '')::text,
    COALESCE(s.kind, 'physical')::text
  FROM himoto.stores s
  LEFT JOIN himoto.users u ON u.id = s.user_id AND u.deleted_at IS NULL
  WHERE s.status = 'opening'
  ORDER BY s.id
$$;
REVOKE ALL ON FUNCTION himoto.store_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.store_directory() TO himoto_scoped;

COMMIT;
