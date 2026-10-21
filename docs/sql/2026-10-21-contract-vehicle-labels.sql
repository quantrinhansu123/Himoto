BEGIN;
SET LOCAL lock_timeout='5s';

-- Read vehicle description fields only for contracts in the caller's scope.
-- Completed rentals keep their labels after the vehicle returns to another branch.
CREATE OR REPLACE FUNCTION himoto.contract_vehicle_labels()
RETURNS TABLE(id bigint, name text, license text, brand text, type text, year integer, color text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
  SELECT v.id::bigint,v.name::text,v.license::text,v.brand::text,v.type::text,v.year::integer,v.color::text
  FROM himoto.vehicles v
  WHERE himoto.access_actor() IS NOT NULL AND EXISTS (
    SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
    WHERE d.vehicle_id=v.id AND d.deleted_at IS NULL AND o.deleted_at IS NULL
      AND himoto.access_store(o.store_id)
  )
$$;
REVOKE ALL ON FUNCTION himoto.contract_vehicle_labels() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.contract_vehicle_labels() TO himoto_scoped;

COMMIT;
