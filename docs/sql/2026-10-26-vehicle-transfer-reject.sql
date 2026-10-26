BEGIN;
SET LOCAL lock_timeout='5s';

-- Destination staff may reject an in-transit transfer; event type mirrors receive.
DROP POLICY IF EXISTS management_scoped_read ON himoto.vehicle_location_events;
CREATE POLICY management_scoped_read ON himoto.vehicle_location_events AS RESTRICTIVE FOR SELECT TO himoto_scoped
  USING (himoto.access_store(from_store_id) OR himoto.access_store(to_store_id)
    OR (event_type IN ('manual_transfer','manual_transfer_receive','manual_transfer_reject','transfer_dispatch','transfer_receive')
      AND ((himoto.access_actor() IS NOT NULL AND himoto.access_operation()='fleet_read') OR himoto.access_transfer_vehicle(vehicle_id))));

DROP POLICY IF EXISTS management_scoped_insert ON himoto.vehicle_location_events;
CREATE POLICY management_scoped_insert ON himoto.vehicle_location_events AS RESTRICTIVE FOR INSERT TO himoto_scoped
  WITH CHECK (created_by=himoto.access_actor() AND (himoto.access_store(from_store_id) OR himoto.access_store(to_store_id)
    OR (event_type IN ('manual_transfer','manual_transfer_receive','manual_transfer_reject') AND himoto.access_transfer_vehicle(vehicle_id))));

DROP POLICY IF EXISTS management_scoped_update ON himoto.vehicle_location_events;
CREATE POLICY management_scoped_update ON himoto.vehicle_location_events AS RESTRICTIVE FOR UPDATE TO himoto_scoped
  USING (himoto.access_store(from_store_id) OR himoto.access_store(to_store_id)
    OR (event_type IN ('manual_transfer','manual_transfer_receive','manual_transfer_reject') AND himoto.access_transfer_vehicle(vehicle_id)))
  WITH CHECK (created_by=himoto.access_actor() AND (himoto.access_store(from_store_id) OR himoto.access_store(to_store_id)));

COMMIT;
