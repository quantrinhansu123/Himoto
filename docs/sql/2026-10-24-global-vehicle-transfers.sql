BEGIN;
SET LOCAL lock_timeout='5s';

-- Global fleet reads are enabled only by the fleet API wrapper. Transfers and
-- receipts additionally pin one vehicle; unrelated writes keep branch RLS.
CREATE OR REPLACE FUNCTION himoto.access_transfer_vehicle(target bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,himoto AS $$
  SELECT himoto.access_actor() IS NOT NULL
    AND himoto.access_operation() IN ('transfer','receive')
    AND target=NULLIF(current_setting('himoto.transfer_vehicle_id',true),'')::bigint
$$;
REVOKE ALL ON FUNCTION himoto.access_transfer_vehicle(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.access_transfer_vehicle(bigint) TO himoto_scoped;

DROP POLICY IF EXISTS management_scoped_read ON himoto.vehicles;
CREATE POLICY management_scoped_read ON himoto.vehicles AS RESTRICTIVE FOR SELECT TO himoto_scoped
  USING (himoto.access_vehicle_store(COALESCE(current_store_id,store_id))
    OR (himoto.access_actor() IS NOT NULL AND himoto.access_operation()='fleet_read')
    OR himoto.access_transfer_vehicle(id));
DROP POLICY IF EXISTS management_scoped_update ON himoto.vehicles;
CREATE POLICY management_scoped_update ON himoto.vehicles AS RESTRICTIVE FOR UPDATE TO himoto_scoped
  USING (himoto.access_vehicle_store(COALESCE(current_store_id,store_id)) OR himoto.access_transfer_vehicle(id))
  WITH CHECK (himoto.access_vehicle_store(COALESCE(current_store_id,store_id)) OR himoto.access_transfer_vehicle(id));

DROP POLICY IF EXISTS management_scoped_read ON himoto.stores;
CREATE POLICY management_scoped_read ON himoto.stores AS RESTRICTIVE FOR SELECT TO himoto_scoped
  USING (himoto.access_store(id) OR (himoto.access_actor() IS NOT NULL AND himoto.access_operation() IN ('fleet_read','transfer','receive')));

DROP POLICY IF EXISTS management_scoped_read ON himoto.vehicle_location_events;
CREATE POLICY management_scoped_read ON himoto.vehicle_location_events AS RESTRICTIVE FOR SELECT TO himoto_scoped
  USING (himoto.access_store(from_store_id) OR himoto.access_store(to_store_id)
    OR (event_type IN ('manual_transfer','manual_transfer_receive','transfer_dispatch','transfer_receive')
      AND ((himoto.access_actor() IS NOT NULL AND himoto.access_operation()='fleet_read') OR himoto.access_transfer_vehicle(vehicle_id))));
DROP POLICY IF EXISTS management_scoped_insert ON himoto.vehicle_location_events;
CREATE POLICY management_scoped_insert ON himoto.vehicle_location_events AS RESTRICTIVE FOR INSERT TO himoto_scoped
  WITH CHECK (created_by=himoto.access_actor() AND (himoto.access_store(from_store_id) OR himoto.access_store(to_store_id)
    OR (event_type IN ('manual_transfer','manual_transfer_receive') AND himoto.access_transfer_vehicle(vehicle_id))));
DROP POLICY IF EXISTS management_scoped_update ON himoto.vehicle_location_events;
CREATE POLICY management_scoped_update ON himoto.vehicle_location_events AS RESTRICTIVE FOR UPDATE TO himoto_scoped
  USING (himoto.access_store(from_store_id) OR himoto.access_store(to_store_id)
    OR (event_type IN ('manual_transfer','manual_transfer_receive') AND himoto.access_transfer_vehicle(vehicle_id)))
  WITH CHECK (created_by=himoto.access_actor() AND (himoto.access_store(from_store_id) OR himoto.access_store(to_store_id)));

DROP POLICY IF EXISTS management_scoped_read ON himoto.vehicle_transfers;
CREATE POLICY management_scoped_read ON himoto.vehicle_transfers AS RESTRICTIVE FOR SELECT TO himoto_scoped
  USING (himoto.access_store(from_store_id) OR himoto.access_store(to_store_id)
    OR (himoto.access_actor() IS NOT NULL AND himoto.access_operation()='fleet_read'));

-- Extend only transfer/receipt photo slots. Registration, contract and customer
-- photo policies retain their existing expressions. Safe to apply repeatedly.
DO $$
DECLARE p record; extra text;
BEGIN
  extra := $scope$(entity_type='vehicles' AND himoto.access_transfer_vehicle(entity_id) AND EXISTS (
    SELECT 1 FROM himoto.vehicle_location_events e WHERE e.vehicle_id=entity_id
      AND e.id=NULLIF(substring(slot from '^(?:transfer|receive)-([0-9]+)-1$'),'')::bigint
      AND e.event_type=CASE WHEN slot LIKE 'receive-%' THEN 'manual_transfer_receive' ELSE 'manual_transfer' END))$scope$;
  FOR p IN SELECT polname,pg_get_expr(polqual,polrelid) AS qualification,pg_get_expr(polwithcheck,polrelid) AS check_expression
    FROM pg_policy WHERE polrelid='himoto.management_record_photos'::regclass
      AND polname IN ('management_scoped_read','management_scoped_insert','management_scoped_update','management_scoped_delete')
  LOOP
    IF position('access_transfer_vehicle' in COALESCE(p.qualification,'')||COALESCE(p.check_expression,''))>0 THEN CONTINUE; END IF;
    IF p.qualification IS NOT NULL THEN EXECUTE format('ALTER POLICY %I ON himoto.management_record_photos USING ((%s) OR (%s))',p.polname,p.qualification,extra); END IF;
    IF p.check_expression IS NOT NULL THEN EXECUTE format('ALTER POLICY %I ON himoto.management_record_photos WITH CHECK ((%s) OR (%s))',p.polname,p.check_expression,extra); END IF;
  END LOOP;
END $$;
COMMIT;
