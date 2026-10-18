BEGIN;
SET LOCAL lock_timeout='5s';

-- Return and lock only the reference, never an unrestricted customer profile.
-- The lock belongs to the caller's draft transaction and prevents a concurrent
-- delete between validation and inserting the contract's customer reference.
CREATE OR REPLACE FUNCTION himoto.lock_customer_for_rental(target bigint)
RETURNS bigint LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,himoto AS $$
  SELECT id FROM himoto.customers
  WHERE id=target AND himoto.access_actor() IS NOT NULL
  FOR SHARE
$$;
REVOKE ALL ON FUNCTION himoto.lock_customer_for_rental(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.lock_customer_for_rental(bigint) TO himoto_scoped;

-- Once a branch has its own contract for the customer, its contract joins can
-- read the source profile. Orders remain subject to their existing branch RLS.
-- Existing customer INSERT/UPDATE/DELETE policies continue to enforce ownership.
DROP POLICY IF EXISTS management_scoped_read ON himoto.customers;
CREATE POLICY management_scoped_read ON himoto.customers AS RESTRICTIVE
FOR SELECT TO himoto_scoped USING (
  himoto.access_store(store_id)
  OR EXISTS (SELECT 1 FROM himoto.orders o
    WHERE o.customer_id=customers.id AND o.deleted_at IS NULL)
);

-- Reading a linked customer does not grant writes to their identity photos.
DROP POLICY IF EXISTS management_scoped_insert ON himoto.management_record_photos;
CREATE POLICY management_scoped_insert ON himoto.management_record_photos AS RESTRICTIVE
FOR INSERT TO himoto_scoped WITH CHECK (
  (entity_type='customers' AND EXISTS (SELECT 1 FROM himoto.customers c
    WHERE c.id=entity_id AND himoto.access_store(c.store_id)))
  OR (entity_type='contracts' AND EXISTS (SELECT 1 FROM himoto.orders o WHERE o.id=entity_id))
);
DROP POLICY IF EXISTS management_scoped_update ON himoto.management_record_photos;
CREATE POLICY management_scoped_update ON himoto.management_record_photos AS RESTRICTIVE
FOR UPDATE TO himoto_scoped USING (
  (entity_type='customers' AND EXISTS (SELECT 1 FROM himoto.customers c
    WHERE c.id=entity_id AND himoto.access_store(c.store_id)))
  OR (entity_type='contracts' AND EXISTS (SELECT 1 FROM himoto.orders o WHERE o.id=entity_id))
) WITH CHECK (
  (entity_type='customers' AND EXISTS (SELECT 1 FROM himoto.customers c
    WHERE c.id=entity_id AND himoto.access_store(c.store_id)))
  OR (entity_type='contracts' AND EXISTS (SELECT 1 FROM himoto.orders o WHERE o.id=entity_id))
);
DROP POLICY IF EXISTS management_scoped_delete ON himoto.management_record_photos;
CREATE POLICY management_scoped_delete ON himoto.management_record_photos AS RESTRICTIVE
FOR DELETE TO himoto_scoped USING (
  (entity_type='customers' AND EXISTS (SELECT 1 FROM himoto.customers c
    WHERE c.id=entity_id AND himoto.access_store(c.store_id)))
  OR (entity_type='contracts' AND EXISTS (SELECT 1 FROM himoto.orders o WHERE o.id=entity_id))
);
COMMIT;
