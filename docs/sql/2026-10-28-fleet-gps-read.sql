BEGIN;
SET LOCAL lock_timeout='5s';

-- Branch staff may open /vehicles and /gps for the whole fleet. The API sets
-- himoto.operation=fleet_read on those GET routes only; contracts and money stay
-- branch-scoped. Unmapped GPS devices are visible during fleet reads.
DROP POLICY IF EXISTS management_scoped_read ON himoto.gps_devices;
CREATE POLICY management_scoped_read ON himoto.gps_devices AS RESTRICTIVE FOR SELECT TO himoto_scoped
  USING (
    (himoto.access_actor() IS NOT NULL AND himoto.access_operation()='fleet_read')
    OR EXISTS(SELECT 1 FROM himoto.vehicles v WHERE v.id=vehicle_id)
  );

DROP POLICY IF EXISTS gps_status_event_read ON himoto.management_gps_status_events;
CREATE POLICY gps_status_event_read ON himoto.management_gps_status_events FOR SELECT TO himoto_scoped
  USING (
    (himoto.access_actor() IS NOT NULL AND himoto.access_operation()='fleet_read')
    OR EXISTS(SELECT 1 FROM himoto.vehicles v WHERE v.id=vehicle_id)
    OR EXISTS(SELECT 1 FROM himoto.gps_devices d WHERE d.id=gps_device_id)
  );

COMMIT;
