BEGIN;
SET LOCAL lock_timeout='5s';

-- Company store list for contract vehicle branch + store manager (Người phụ trách).
-- OUT columns changed vs 2026-10-17; DROP first (CREATE OR REPLACE cannot change row type).
DROP FUNCTION IF EXISTS himoto.store_directory();
CREATE FUNCTION himoto.store_directory() RETURNS TABLE(
  id bigint, store_name varchar, manager_user_id bigint, manager_name text,
  store_phone text, store_address text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
  SELECT s.id::bigint, s.store_name, s.user_id::bigint, u.name::text,
    COALESCE(s.store_phone, '')::text, COALESCE(s.store_address, '')::text
  FROM himoto.stores s
  LEFT JOIN himoto.users u ON u.id = s.user_id AND u.deleted_at IS NULL
  WHERE s.status = 'opening'
  ORDER BY s.id
$$;
REVOKE ALL ON FUNCTION himoto.store_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.store_directory() TO himoto_scoped;

-- Lock vehicles for contract finalize across branches without granting table-wide SELECT.
CREATE OR REPLACE FUNCTION himoto.lock_vehicles_for_contract(targets bigint[])
RETURNS TABLE(id bigint, license text, status text, store_id bigint, store_name text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
BEGIN
  IF himoto.access_actor() IS NULL THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT v.id::bigint, v.license::text, v.status::text,
    COALESCE(v.current_store_id, v.store_id)::bigint, s.store_name::text
  FROM himoto.vehicles v
  LEFT JOIN himoto.stores s ON s.id = COALESCE(v.current_store_id, v.store_id)
  WHERE v.id = ANY(targets)
  ORDER BY v.id
  FOR UPDATE OF v;
END;
$$;
REVOKE ALL ON FUNCTION himoto.lock_vehicles_for_contract(bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.lock_vehicles_for_contract(bigint[]) TO himoto_scoped;

-- Mark rented vehicles using after finalize; same cross-branch boundary as lock above.
CREATE OR REPLACE FUNCTION himoto.mark_vehicles_using(targets bigint[])
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
BEGIN
  IF himoto.access_actor() IS NULL THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  UPDATE himoto.vehicles SET status = 'using', updated_at = now() WHERE id = ANY(targets);
END;
$$;
REVOKE ALL ON FUNCTION himoto.mark_vehicles_using(bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.mark_vehicles_using(bigint[]) TO himoto_scoped;

-- Minimal staff row for contract representative at any branch.
CREATE OR REPLACE FUNCTION himoto.staff_for_contract(target bigint)
RETURNS TABLE(id bigint, store_id bigint, user_id bigint, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
  SELECT p.id::bigint, p.store_id::bigint, p.user_id::bigint, p.full_name::text
  FROM himoto.staff_profiles p
  WHERE p.id = target AND himoto.access_actor() IS NOT NULL
$$;
REVOKE ALL ON FUNCTION himoto.staff_for_contract(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.staff_for_contract(bigint) TO himoto_scoped;

COMMIT;
