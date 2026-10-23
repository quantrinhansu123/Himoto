BEGIN;
SET LOCAL lock_timeout='60s';

-- Ownership staff/managers may see and move headquarters stock (Nguyễn Hoàng / trụ sở chính)
-- in addition to their lease-to-own warehouse. Other branch scopes stay store-bound.
CREATE OR REPLACE FUNCTION himoto.is_headquarters_store(target bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'himoto'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM himoto.stores s
    WHERE s.id=target
      AND s.kind IS DISTINCT FROM 'lease_to_own'
      AND (
        translate(lower(s.store_name),'áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ',
          'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd') LIKE '%nguyen hoang%'
        OR translate(lower(s.store_name),'áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ',
          'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd') LIKE '%tru so chinh%'
      )
  )
$$;
REVOKE ALL ON FUNCTION himoto.is_headquarters_store(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.is_headquarters_store(bigint) TO himoto_scoped;

CREATE OR REPLACE FUNCTION himoto.actor_owns_lease_store()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'himoto'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM himoto.stores s
    WHERE s.id=NULLIF(current_setting('himoto.store_id',true),'')::bigint
      AND s.kind='lease_to_own'
  )
$$;
REVOKE ALL ON FUNCTION himoto.actor_owns_lease_store() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.actor_owns_lease_store() TO himoto_scoped;

CREATE OR REPLACE FUNCTION himoto.ownership_may_use_headquarters_vehicle(target bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'himoto'
AS $$
  SELECT himoto.actor_owns_lease_store() AND himoto.is_headquarters_store(target)
$$;
REVOKE ALL ON FUNCTION himoto.ownership_may_use_headquarters_vehicle(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.ownership_may_use_headquarters_vehicle(bigint) TO himoto_scoped;

CREATE OR REPLACE FUNCTION himoto.access_vehicle_store(target numeric)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'himoto'
AS $$
  SELECT himoto.access_store(target) OR himoto.ownership_may_use_headquarters_vehicle(target::bigint)
$$;
REVOKE ALL ON FUNCTION himoto.access_vehicle_store(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.access_vehicle_store(numeric) TO himoto_scoped;

DROP POLICY IF EXISTS management_scoped_read ON himoto.vehicles;
CREATE POLICY management_scoped_read ON himoto.vehicles AS RESTRICTIVE FOR SELECT TO himoto_scoped
  USING (
    himoto.access_vehicle_store(COALESCE(current_store_id,store_id))
    OR (himoto.access_operation()='transfer' AND status='in_transit' AND id=NULLIF(current_setting('himoto.transfer_vehicle_id',true),'')::bigint)
  );
DROP POLICY IF EXISTS management_scoped_insert ON himoto.vehicles;
CREATE POLICY management_scoped_insert ON himoto.vehicles AS RESTRICTIVE FOR INSERT TO himoto_scoped
  WITH CHECK (himoto.access_vehicle_store(COALESCE(current_store_id,store_id)) OR himoto.access_operation()='transfer');
DROP POLICY IF EXISTS management_scoped_update ON himoto.vehicles;
CREATE POLICY management_scoped_update ON himoto.vehicles AS RESTRICTIVE FOR UPDATE TO himoto_scoped
  USING (
    himoto.access_vehicle_store(COALESCE(current_store_id,store_id))
    OR (himoto.access_operation()='transfer' AND status='in_transit' AND id=NULLIF(current_setting('himoto.transfer_vehicle_id',true),'')::bigint)
  )
  WITH CHECK (himoto.access_vehicle_store(COALESCE(current_store_id,store_id)) OR himoto.access_operation()='transfer');
DROP POLICY IF EXISTS management_scoped_delete ON himoto.vehicles;
CREATE POLICY management_scoped_delete ON himoto.vehicles AS RESTRICTIVE FOR DELETE TO himoto_scoped
  USING (himoto.access_vehicle_store(COALESCE(current_store_id,store_id)) OR himoto.access_operation()='transfer');

UPDATE himoto.management_account_access
SET permissions=(
  SELECT COALESCE(jsonb_agg(to_jsonb(value) ORDER BY value),'[]'::jsonb)
  FROM (
    SELECT DISTINCT value
    FROM jsonb_array_elements_text(COALESCE(permissions,'[]'::jsonb) || '["contracts.return","vehicles.transfer"]'::jsonb) AS value
  ) merged
), updated_at=now()
WHERE access_role='ownership_staff';

COMMIT;
