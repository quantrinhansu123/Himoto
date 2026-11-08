-- Preserve the existing actor/order scope while evaluating it once per store,
-- instead of repeatedly for every historical order attached to every vehicle.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION himoto.contract_vehicle_labels()
RETURNS TABLE(id bigint, name text, license text, brand text, type text, year integer, color text, store_id bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
  WITH order_stores AS MATERIALIZED (
    SELECT DISTINCT o.store_id FROM himoto.orders o WHERE o.deleted_at IS NULL
  ), allowed_stores AS MATERIALIZED (
    SELECT os.store_id FROM order_stores os
    WHERE himoto.access_actor() IS NOT NULL AND himoto.access_order_store(os.store_id)
  ), visible_vehicles AS MATERIALIZED (
    SELECT DISTINCT d.vehicle_id
    FROM allowed_stores allowed JOIN himoto.orders o ON o.store_id IS NOT DISTINCT FROM allowed.store_id
    JOIN himoto.order_vehicle_details d ON d.order_id=o.id
    WHERE o.deleted_at IS NULL AND d.deleted_at IS NULL
  )
  SELECT v.id::bigint,v.name::text,v.license::text,v.brand::text,v.type::text,v.year::integer,v.color::text,v.store_id::bigint
  FROM himoto.vehicles v JOIN visible_vehicles visible ON visible.vehicle_id=v.id
$$;
COMMIT;
