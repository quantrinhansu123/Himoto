-- Trụ sở chính is an ownership customer-source / revenue store (not only vehicle stock).
-- Ownership staff/managers may read and write orders (and related money rows) whose
-- store_id is Trụ sở chính, in addition to their lease_to_own warehouse.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE OR REPLACE FUNCTION himoto.is_ownership_customer_source_store(target bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'himoto'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM himoto.stores s
    WHERE s.id=target
      AND (
        s.kind='lease_to_own'
        OR translate(lower(s.store_name),
          'áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ',
          'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd') LIKE '%tru so chinh%'
      )
  )
$$;
REVOKE ALL ON FUNCTION himoto.is_ownership_customer_source_store(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.is_ownership_customer_source_store(bigint) TO himoto_scoped;

CREATE OR REPLACE FUNCTION himoto.ownership_may_use_headquarters_customer_source(target bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'himoto'
AS $$
  SELECT himoto.actor_owns_lease_store()
    AND EXISTS (
      SELECT 1 FROM himoto.stores s
      WHERE s.id=target
        AND translate(lower(s.store_name),
          'áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ',
          'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd') LIKE '%tru so chinh%'
    )
$$;
REVOKE ALL ON FUNCTION himoto.ownership_may_use_headquarters_customer_source(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.ownership_may_use_headquarters_customer_source(bigint) TO himoto_scoped;

CREATE OR REPLACE FUNCTION himoto.access_order_store(target numeric)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'himoto'
AS $$
  SELECT himoto.access_store(target) OR himoto.ownership_may_use_headquarters_customer_source(target::bigint)
$$;
REVOKE ALL ON FUNCTION himoto.access_order_store(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.access_order_store(numeric) TO himoto_scoped;

DROP POLICY IF EXISTS management_scoped_read ON himoto.orders;
CREATE POLICY management_scoped_read ON himoto.orders AS RESTRICTIVE FOR SELECT TO himoto_scoped
  USING (himoto.access_order_store(store_id));
DROP POLICY IF EXISTS management_scoped_insert ON himoto.orders;
CREATE POLICY management_scoped_insert ON himoto.orders AS RESTRICTIVE FOR INSERT TO himoto_scoped
  WITH CHECK (himoto.access_order_store(store_id));
DROP POLICY IF EXISTS management_scoped_update ON himoto.orders;
CREATE POLICY management_scoped_update ON himoto.orders AS RESTRICTIVE FOR UPDATE TO himoto_scoped
  USING (himoto.access_order_store(store_id))
  WITH CHECK (himoto.access_order_store(store_id));
DROP POLICY IF EXISTS management_scoped_delete ON himoto.orders;
CREATE POLICY management_scoped_delete ON himoto.orders AS RESTRICTIVE FOR DELETE TO himoto_scoped
  USING (himoto.access_order_store(store_id));

-- Receipts / cash / bank rows for HQ-sourced ownership contracts.
DROP POLICY IF EXISTS management_scoped_read ON himoto.transactions;
CREATE POLICY management_scoped_read ON himoto.transactions AS RESTRICTIVE FOR SELECT TO himoto_scoped
  USING (himoto.access_order_store(store_id));
DROP POLICY IF EXISTS management_scoped_insert ON himoto.transactions;
CREATE POLICY management_scoped_insert ON himoto.transactions AS RESTRICTIVE FOR INSERT TO himoto_scoped
  WITH CHECK (himoto.access_order_store(store_id));
DROP POLICY IF EXISTS management_scoped_update ON himoto.transactions;
CREATE POLICY management_scoped_update ON himoto.transactions AS RESTRICTIVE FOR UPDATE TO himoto_scoped
  USING (himoto.access_order_store(store_id))
  WITH CHECK (himoto.access_order_store(store_id));
DROP POLICY IF EXISTS management_scoped_delete ON himoto.transactions;
CREATE POLICY management_scoped_delete ON himoto.transactions AS RESTRICTIVE FOR DELETE TO himoto_scoped
  USING (himoto.access_order_store(store_id));

-- Allow ownership actors to resolve Trụ sở chính in dropdowns / draft validation.
DROP POLICY IF EXISTS management_scoped_read ON himoto.stores;
CREATE POLICY management_scoped_read ON himoto.stores AS RESTRICTIVE FOR SELECT TO himoto_scoped
  USING (
    himoto.access_store(id)
    OR himoto.ownership_may_use_headquarters_customer_source(id)
    OR (himoto.access_actor() IS NOT NULL
      AND himoto.access_operation() IN ('fleet_read','transfer','receive','reject','cancel'))
  );
DROP POLICY IF EXISTS management_scoped_update ON himoto.stores;
CREATE POLICY management_scoped_update ON himoto.stores AS RESTRICTIVE FOR UPDATE TO himoto_scoped
  USING (
    himoto.access_store(id)
    OR himoto.ownership_may_use_headquarters_customer_source(id)
    OR (himoto.access_actor() IS NOT NULL
      AND himoto.access_operation() IN ('fleet_read','transfer','receive','reject','cancel'))
  )
  WITH CHECK (false);

COMMIT;
