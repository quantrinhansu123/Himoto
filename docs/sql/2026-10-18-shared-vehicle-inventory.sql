BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION himoto.vehicle_has_other_rental(target bigint,excluded_order bigint) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
  SELECT EXISTS(SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
    WHERE d.vehicle_id=target AND d.order_id IS DISTINCT FROM excluded_order AND d.deleted_at IS NULL AND o.deleted_at IS NULL
      AND o.order_status IN ('renting','overdue','wait_payment','pending','deposit_contract','bad_debt'))
$$;
REVOKE ALL ON FUNCTION himoto.vehicle_has_other_rental(bigint,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.vehicle_has_other_rental(bigint,bigint) TO himoto_scoped;
-- Same open-rental gate; returns license + contract + store + responsible person (bypasses branch RLS for finalize/handover errors).
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
-- Shared read-only stock directory. Do not grant cross-branch SELECT/UPDATE on vehicles or orders.
CREATE OR REPLACE FUNCTION himoto.vehicle_inventory() RETURNS TABLE(
  id bigint,name text,license text,type text,status text,store_id bigint,store_name text,
  from_store_name text,to_store_name text,available boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
  WITH blocked AS MATERIALIZED (SELECT DISTINCT d.vehicle_id FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
    WHERE d.deleted_at IS NULL AND o.deleted_at IS NULL AND o.order_status IN ('renting','overdue','wait_payment','pending','deposit_contract','bad_debt'))
  SELECT v.id::bigint,v.name::text,v.license::text,v.type::text,v.status::text,COALESCE(v.current_store_id,v.store_id)::bigint,s.store_name::text,
    fs.store_name::text,ts.store_name::text,(v.status='ready' AND blocked.vehicle_id IS NULL)
  FROM himoto.vehicles v LEFT JOIN blocked ON blocked.vehicle_id=v.id LEFT JOIN himoto.stores s ON s.id=COALESCE(v.current_store_id,v.store_id)
  LEFT JOIN LATERAL (SELECT e.from_store_id,e.to_store_id FROM himoto.vehicle_location_events e
    WHERE e.vehicle_id=v.id AND e.event_type IN ('manual_transfer','transfer_dispatch') ORDER BY e.id DESC LIMIT 1) transfer ON v.status='in_transit'
  LEFT JOIN himoto.stores fs ON fs.id=transfer.from_store_id LEFT JOIN himoto.stores ts ON ts.id=transfer.to_store_id
  ORDER BY s.store_name,v.license,v.id
$$;
REVOKE ALL ON FUNCTION himoto.vehicle_inventory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.vehicle_inventory() TO himoto_scoped;
COMMIT;
