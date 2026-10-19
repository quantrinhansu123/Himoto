BEGIN;
SET LOCAL lock_timeout='5s';
-- Open rentals that block issuing a vehicle; bypasses branch RLS so staff see license, contract, store, and responsible person.
DROP FUNCTION IF EXISTS himoto.vehicle_other_rental_conflicts(bigint[],bigint);
CREATE OR REPLACE FUNCTION himoto.vehicle_other_rental_conflicts(targets bigint[], excluded_order bigint)
RETURNS TABLE(license text, code text, store_name text, manager_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
  SELECT DISTINCT v.license::text,
    COALESCE(NULLIF(o.contract_number,''), NULLIF(o.draft_reference,''), '#' || o.id::text)::text AS code,
    COALESCE(s.store_name, '')::text AS store_name,
    COALESCE(
      (SELECT sp.full_name FROM himoto.staff_profiles sp
        WHERE sp.user_id=o.contract_responsible_user_id
        ORDER BY CASE WHEN sp.store_id=o.store_id THEN 0 ELSE 1 END, sp.id LIMIT 1),
      cu.name,
      mu.name,
      ''
    )::text AS manager_name
  FROM himoto.order_vehicle_details d
  JOIN himoto.orders o ON o.id=d.order_id
  JOIN himoto.vehicles v ON v.id=d.vehicle_id
  LEFT JOIN himoto.stores s ON s.id=o.store_id
  LEFT JOIN himoto.users cu ON cu.id=o.contract_responsible_user_id
  LEFT JOIN himoto.users mu ON mu.id=s.user_id
  WHERE d.vehicle_id = ANY(targets)
    AND d.order_id IS DISTINCT FROM excluded_order
    AND d.deleted_at IS NULL AND o.deleted_at IS NULL
    AND o.order_status IN ('renting','overdue','wait_payment','pending','deposit_contract','bad_debt')
  ORDER BY 1, 2
$$;
REVOKE ALL ON FUNCTION himoto.vehicle_other_rental_conflicts(bigint[],bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.vehicle_other_rental_conflicts(bigint[],bigint) TO himoto_scoped;
COMMIT;
