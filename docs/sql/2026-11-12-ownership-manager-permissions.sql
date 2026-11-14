-- Apply before the corresponding application release. Never promotes a user to
-- the global admin role. The session layer also normalizes existing sessions.
BEGIN;
SET LOCAL lock_timeout='5s';

-- Replace the older admin-only grant constraint with the explicitly requested
-- local exception. The normalization trigger below also verifies the store kind.
ALTER TABLE himoto.management_account_access DROP CONSTRAINT IF EXISTS account_access_admin_management;
ALTER TABLE himoto.management_account_access ADD CONSTRAINT account_access_admin_management
CHECK (NOT (permissions ? 'accounts.manage') OR access_role='admin'
  OR access_role='ownership_manager' AND NOT scope_all AND store_id IS NOT NULL);

CREATE OR REPLACE FUNCTION himoto.normalize_ownership_manager_access()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,himoto AS $$
DECLARE chosen bigint; chosen_kind text;
BEGIN
  chosen:=NEW.store_id;
  SELECT kind INTO chosen_kind FROM himoto.stores WHERE id=chosen;
  IF NEW.access_role='ownership_manager' OR NEW.access_role='branch_manager' AND chosen_kind='lease_to_own' THEN
    IF chosen IS NULL THEN
      SELECT s.id INTO chosen FROM himoto.users u JOIN himoto.stores s ON s.id=u.store_id AND s.kind='lease_to_own' WHERE u.id=NEW.user_id;
      IF chosen IS NULL THEN SELECT min(id) INTO chosen FROM himoto.stores WHERE kind='lease_to_own' HAVING count(*)=1; END IF;
    END IF;
    IF chosen IS NULL OR NOT EXISTS(SELECT 1 FROM himoto.stores WHERE id=chosen AND kind='lease_to_own') THEN
      RAISE EXCEPTION 'ownership manager requires a lease-to-own store' USING ERRCODE='23514';
    END IF;
    NEW.access_role:='ownership_manager';NEW.store_id:=chosen;NEW.scope_all:=false;
    NEW.permissions:='["contracts.read","contracts.draft","contracts.finalize","contracts.renew","contracts.return","contracts.delete","contracts.settle","customers.read","customers.write","vehicles.read","vehicles.transfer","vehicles.receive","vehicles.write","hr.read","hr.write","finance.read","finance.write","shift.review","settings.write","accounts.manage"]'::jsonb;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS normalize_ownership_manager_access ON himoto.management_account_access;
CREATE TRIGGER normalize_ownership_manager_access BEFORE INSERT OR UPDATE ON himoto.management_account_access
FOR EACH ROW EXECUTE FUNCTION himoto.normalize_ownership_manager_access();
REVOKE ALL ON FUNCTION himoto.normalize_ownership_manager_access() FROM PUBLIC;

UPDATE himoto.management_account_access a SET updated_at=now()
WHERE a.access_role='ownership_manager' OR a.access_role='branch_manager' AND EXISTS(
  SELECT 1 FROM himoto.stores s WHERE s.id=a.store_id AND s.kind='lease_to_own');

CREATE OR REPLACE FUNCTION himoto.is_scoped_ownership_manager(target bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
  SELECT himoto.access_store(target) AND EXISTS(
    SELECT 1 FROM himoto.management_account_access a JOIN himoto.stores s ON s.id=a.store_id
    JOIN himoto.users u ON u.id=a.user_id
    WHERE a.user_id=himoto.access_actor() AND a.access_role='ownership_manager'
      AND a.enabled AND NOT a.scope_all AND a.store_id=target AND s.kind='lease_to_own'
      AND u.status='active' AND u.deleted_at IS NULL)
$$;
REVOKE ALL ON FUNCTION himoto.is_scoped_ownership_manager(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.is_scoped_ownership_manager(bigint) TO himoto_scoped;
DROP POLICY IF EXISTS management_scoped_update ON himoto.stores;
CREATE POLICY management_scoped_update ON himoto.stores AS RESTRICTIVE FOR UPDATE TO himoto_scoped
USING(himoto.is_scoped_ownership_manager(id)) WITH CHECK(himoto.is_scoped_ownership_manager(id) AND kind='lease_to_own');
DROP POLICY IF EXISTS management_scoped_delete ON himoto.stores;
CREATE POLICY management_scoped_delete ON himoto.stores AS RESTRICTIVE FOR DELETE TO himoto_scoped
USING(himoto.is_scoped_ownership_manager(id));

-- Existing ownership lookup rules also expose the HQ customer-source store.
-- The new administrator powers may only mutate the assigned lease-to-own store.
-- Shared read-only lookups retain their existing visibility.
DO $$
DECLARE item text; rule text;
BEGIN
  rule:='NOT himoto.is_scoped_ownership_manager(NULLIF(current_setting(''himoto.store_id'',true),'''')::bigint) OR himoto.access_store(store_id)';
  FOREACH item IN ARRAY ARRAY['orders','transactions','banks','cash','customers','staff_profiles','store_duty_schedules','battery_contracts'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS ownership_manager_local_insert ON himoto.%I',item);
    EXECUTE format('CREATE POLICY ownership_manager_local_insert ON himoto.%I AS RESTRICTIVE FOR INSERT TO himoto_scoped WITH CHECK (%s)',item,rule);
    EXECUTE format('DROP POLICY IF EXISTS ownership_manager_local_update ON himoto.%I',item);
    EXECUTE format('CREATE POLICY ownership_manager_local_update ON himoto.%I AS RESTRICTIVE FOR UPDATE TO himoto_scoped USING (%s) WITH CHECK (%s)',item,rule,rule);
    EXECUTE format('DROP POLICY IF EXISTS ownership_manager_local_delete ON himoto.%I',item);
    EXECUTE format('CREATE POLICY ownership_manager_local_delete ON himoto.%I AS RESTRICTIVE FOR DELETE TO himoto_scoped USING (%s)',item,rule);
  END LOOP;
END $$;
COMMIT;
