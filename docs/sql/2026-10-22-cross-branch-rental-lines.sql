BEGIN;
SET LOCAL lock_timeout='60s';

-- order_vehicle_details write used to require a visible himoto.vehicles row.
-- Vehicles RLS is store-scoped, so a Hà Đông contract cannot insert a Láng bike.
-- Existence is checked through this definer helper; FK still enforces the id.
CREATE OR REPLACE FUNCTION himoto.vehicle_exists_for_contract(target bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'himoto'
AS $$
  SELECT EXISTS(SELECT 1 FROM himoto.vehicles WHERE id=target)
$$;
REVOKE ALL ON FUNCTION himoto.vehicle_exists_for_contract(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.vehicle_exists_for_contract(bigint) TO himoto_scoped;

DROP POLICY IF EXISTS management_scoped_insert ON himoto.order_vehicle_details;
CREATE POLICY management_scoped_insert ON himoto.order_vehicle_details AS RESTRICTIVE FOR INSERT TO himoto_scoped
  WITH CHECK (
    EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=order_id)
    AND himoto.vehicle_exists_for_contract(vehicle_id)
  );

DROP POLICY IF EXISTS management_scoped_update ON himoto.order_vehicle_details;
CREATE POLICY management_scoped_update ON himoto.order_vehicle_details AS RESTRICTIVE FOR UPDATE TO himoto_scoped
  USING (EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=order_id))
  WITH CHECK (
    EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=order_id)
    AND himoto.vehicle_exists_for_contract(vehicle_id)
  );

DROP POLICY IF EXISTS management_scoped_delete ON himoto.order_vehicle_details;
CREATE POLICY management_scoped_delete ON himoto.order_vehicle_details AS RESTRICTIVE FOR DELETE TO himoto_scoped
  USING (
    EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=order_id)
    AND himoto.vehicle_exists_for_contract(vehicle_id)
  );

COMMIT;
