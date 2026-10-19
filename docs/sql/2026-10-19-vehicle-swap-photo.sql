BEGIN;
SET LOCAL lock_timeout = '5s';

-- Allow vehicle transfer photos (Chuyển xe) and one contract vehicle-swap photo (Đổi xe).
ALTER TABLE himoto.management_record_photos DROP CONSTRAINT IF EXISTS management_record_photos_entity_type_check;
ALTER TABLE himoto.management_record_photos ADD CONSTRAINT management_record_photos_entity_type_check
  CHECK (entity_type IN ('customers', 'contracts', 'vehicles'));

ALTER TABLE himoto.management_record_photos ADD COLUMN IF NOT EXISTS vehicle_id bigint
  GENERATED ALWAYS AS (CASE WHEN entity_type = 'vehicles' THEN entity_id END) STORED
  REFERENCES himoto.vehicles(id) ON DELETE CASCADE;

ALTER TABLE himoto.management_record_photos DROP CONSTRAINT IF EXISTS management_record_photos_slots;
ALTER TABLE himoto.management_record_photos ADD CONSTRAINT management_record_photos_slots CHECK(
  (entity_type='customers' AND slot IN('id_front','id_back','driver_license')) OR
  (entity_type='contracts' AND (slot IN('driver-license','customer-id-front','customer-id-back','customer-driver-license') OR slot ~ '^plate-[1-9][0-9]{0,14}$' OR
    slot ~ '^(rental|handover)-([1-9][0-9]{0,14}|video-[1-3]|document-[1-9][0-9]{0,14})$' OR
    slot ~ '^(return|renewal|renewal-receipt)-[1-9][0-9]{0,14}-([1-9][0-9]{0,14}|video-[1-3]|document-[1-9][0-9]{0,14})$' OR
    slot ~ '^battery-swap-[1-9][0-9]{0,14}-([12]|video-1|document-[1-9][0-9]{0,14})$' OR
    slot ~ '^vehicle-swap-[1-9][0-9]{0,14}-1$')) OR
  (entity_type='vehicles' AND slot ~ '^(transfer|receive)-[1-9][0-9]{0,14}-1$')
);

-- Transfer photos stay reachable from either store on the transfer event.
DROP POLICY IF EXISTS management_scoped_read ON himoto.management_record_photos;
CREATE POLICY management_scoped_read ON himoto.management_record_photos AS RESTRICTIVE
FOR SELECT TO himoto_scoped USING (
  (entity_type='customers' AND EXISTS (SELECT 1 FROM himoto.customers c WHERE c.id=entity_id))
  OR (entity_type='contracts' AND EXISTS (SELECT 1 FROM himoto.orders o WHERE o.id=entity_id))
  OR (entity_type='vehicles' AND EXISTS (
    SELECT 1 FROM himoto.vehicle_location_events e
    WHERE e.vehicle_id=entity_id
      AND e.id=NULLIF(substring(slot from '^(?:transfer|receive)-([0-9]+)-1$'),'')::bigint
      AND e.event_type IN ('manual_transfer','manual_transfer_receive')
      AND (himoto.access_store(e.from_store_id) OR himoto.access_store(e.to_store_id))))
);
DROP POLICY IF EXISTS management_scoped_insert ON himoto.management_record_photos;
CREATE POLICY management_scoped_insert ON himoto.management_record_photos AS RESTRICTIVE
FOR INSERT TO himoto_scoped WITH CHECK (
  (entity_type='customers' AND EXISTS (SELECT 1 FROM himoto.customers c
    WHERE c.id=entity_id AND himoto.access_store(c.store_id)))
  OR (entity_type='contracts' AND EXISTS (SELECT 1 FROM himoto.orders o WHERE o.id=entity_id))
  OR (entity_type='vehicles' AND EXISTS (
    SELECT 1 FROM himoto.vehicle_location_events e
    WHERE e.vehicle_id=entity_id
      AND e.id=NULLIF(substring(slot from '^(?:transfer|receive)-([0-9]+)-1$'),'')::bigint
      AND e.event_type IN ('manual_transfer','manual_transfer_receive')
      AND (himoto.access_store(e.from_store_id) OR himoto.access_store(e.to_store_id))))
);
DROP POLICY IF EXISTS management_scoped_update ON himoto.management_record_photos;
CREATE POLICY management_scoped_update ON himoto.management_record_photos AS RESTRICTIVE
FOR UPDATE TO himoto_scoped USING (
  (entity_type='customers' AND EXISTS (SELECT 1 FROM himoto.customers c
    WHERE c.id=entity_id AND himoto.access_store(c.store_id)))
  OR (entity_type='contracts' AND EXISTS (SELECT 1 FROM himoto.orders o WHERE o.id=entity_id))
  OR (entity_type='vehicles' AND EXISTS (
    SELECT 1 FROM himoto.vehicle_location_events e
    WHERE e.vehicle_id=entity_id
      AND e.id=NULLIF(substring(slot from '^(?:transfer|receive)-([0-9]+)-1$'),'')::bigint
      AND e.event_type IN ('manual_transfer','manual_transfer_receive')
      AND (himoto.access_store(e.from_store_id) OR himoto.access_store(e.to_store_id))))
) WITH CHECK (
  (entity_type='customers' AND EXISTS (SELECT 1 FROM himoto.customers c
    WHERE c.id=entity_id AND himoto.access_store(c.store_id)))
  OR (entity_type='contracts' AND EXISTS (SELECT 1 FROM himoto.orders o WHERE o.id=entity_id))
  OR (entity_type='vehicles' AND EXISTS (
    SELECT 1 FROM himoto.vehicle_location_events e
    WHERE e.vehicle_id=entity_id
      AND e.id=NULLIF(substring(slot from '^(?:transfer|receive)-([0-9]+)-1$'),'')::bigint
      AND e.event_type IN ('manual_transfer','manual_transfer_receive')
      AND (himoto.access_store(e.from_store_id) OR himoto.access_store(e.to_store_id))))
);
DROP POLICY IF EXISTS management_scoped_delete ON himoto.management_record_photos;
CREATE POLICY management_scoped_delete ON himoto.management_record_photos AS RESTRICTIVE
FOR DELETE TO himoto_scoped USING (
  (entity_type='customers' AND EXISTS (SELECT 1 FROM himoto.customers c
    WHERE c.id=entity_id AND himoto.access_store(c.store_id)))
  OR (entity_type='contracts' AND EXISTS (SELECT 1 FROM himoto.orders o WHERE o.id=entity_id))
  OR (entity_type='vehicles' AND EXISTS (
    SELECT 1 FROM himoto.vehicle_location_events e
    WHERE e.vehicle_id=entity_id
      AND e.id=NULLIF(substring(slot from '^(?:transfer|receive)-([0-9]+)-1$'),'')::bigint
      AND e.event_type IN ('manual_transfer','manual_transfer_receive')
      AND (himoto.access_store(e.from_store_id) OR himoto.access_store(e.to_store_id))))
);

COMMIT;
