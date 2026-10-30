BEGIN;
SET LOCAL lock_timeout='5s';

-- Transfer actions remain pinned to one vehicle. The service checks the creator
-- against the authenticated actor under the vehicle/transfer row locks.
CREATE OR REPLACE FUNCTION himoto.access_transfer_vehicle(target bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,himoto AS $$
  SELECT himoto.access_actor() IS NOT NULL
    AND himoto.access_operation() IN ('transfer','receive','reject','cancel')
    AND target=NULLIF(current_setting('himoto.transfer_vehicle_id',true),'')::bigint
$$;
REVOKE ALL ON FUNCTION himoto.access_transfer_vehicle(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.access_transfer_vehicle(bigint) TO himoto_scoped;

DROP POLICY IF EXISTS management_scoped_read ON himoto.stores;
CREATE POLICY management_scoped_read ON himoto.stores AS RESTRICTIVE FOR SELECT TO himoto_scoped
  USING (himoto.access_store(id) OR (himoto.access_actor() IS NOT NULL
    AND himoto.access_operation() IN ('fleet_read','transfer','receive','reject','cancel')));

-- SELECT ... FOR SHARE also evaluates UPDATE USING. Allow the reference lock,
-- while WITH CHECK(false) continues to prohibit changing branch records.
DROP POLICY IF EXISTS management_scoped_update ON himoto.stores;
CREATE POLICY management_scoped_update ON himoto.stores AS RESTRICTIVE FOR UPDATE TO himoto_scoped
  USING (himoto.access_store(id) OR (himoto.access_actor() IS NOT NULL
    AND himoto.access_operation() IN ('transfer','receive','reject','cancel')))
  WITH CHECK (false);

DROP POLICY IF EXISTS management_scoped_read ON himoto.vehicle_location_events;
CREATE POLICY management_scoped_read ON himoto.vehicle_location_events AS RESTRICTIVE FOR SELECT TO himoto_scoped
  USING (himoto.access_store(from_store_id) OR himoto.access_store(to_store_id)
    OR (event_type IN ('manual_transfer','manual_transfer_receive','manual_transfer_reject','manual_transfer_cancel','transfer_dispatch','transfer_receive')
      AND ((himoto.access_actor() IS NOT NULL AND himoto.access_operation()='fleet_read') OR himoto.access_transfer_vehicle(vehicle_id))));

DROP POLICY IF EXISTS management_scoped_insert ON himoto.vehicle_location_events;
CREATE POLICY management_scoped_insert ON himoto.vehicle_location_events AS RESTRICTIVE FOR INSERT TO himoto_scoped
  WITH CHECK (created_by=himoto.access_actor() AND (himoto.access_store(from_store_id) OR himoto.access_store(to_store_id)
    OR (event_type IN ('manual_transfer','manual_transfer_receive','manual_transfer_reject','manual_transfer_cancel') AND himoto.access_transfer_vehicle(vehicle_id))));

COMMIT;
