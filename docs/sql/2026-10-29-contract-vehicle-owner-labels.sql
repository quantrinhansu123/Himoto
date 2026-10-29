BEGIN;
SET LOCAL lock_timeout='5s';

-- Contract lists now display the vehicle's owning store as well as its stock
-- location. Keep the existing actor/contract scope and add only that owner ID.
-- PostgreSQL requires recreating a function when its TABLE result gains a column.
-- No CASCADE: dependent database objects must prevent an unsafe replacement.
DROP FUNCTION IF EXISTS himoto.contract_vehicle_labels();
CREATE FUNCTION himoto.contract_vehicle_labels()
RETURNS TABLE(id bigint, name text, license text, brand text, type text, year integer, color text, store_id bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
  SELECT v.id::bigint,v.name::text,v.license::text,v.brand::text,v.type::text,v.year::integer,v.color::text,v.store_id::bigint
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
