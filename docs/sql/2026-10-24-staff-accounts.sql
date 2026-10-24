BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='himoto.management_account_access'::regclass AND contype='c'
    AND (pg_get_constraintdef(oid) LIKE '%access_role%' OR pg_get_constraintdef(oid) LIKE '%scope_all%')
  LOOP EXECUTE format('ALTER TABLE himoto.management_account_access DROP CONSTRAINT %I',c.conname); END LOOP;
END $$;
ALTER TABLE himoto.management_account_access
  ADD CONSTRAINT account_access_role CHECK(access_role IN('branch_staff','branch_manager','ownership_staff','ownership_manager','hr','headquarters_sales','headquarters_debt','accounting','internal_control','admin')),
  ADD CONSTRAINT account_access_scope CHECK(scope_all OR store_id IS NOT NULL OR NOT enabled),
  ADD CONSTRAINT account_access_branch_scope CHECK(access_role NOT IN('branch_staff','branch_manager','ownership_staff','ownership_manager') OR (NOT scope_all AND (store_id IS NOT NULL OR NOT enabled)));
CREATE TABLE IF NOT EXISTS himoto.management_staff_user_links (
  user_id bigint PRIMARY KEY REFERENCES himoto.users(id),staff_id bigint NOT NULL REFERENCES himoto.staff_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE himoto.management_staff_user_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_user_links_read ON himoto.management_staff_user_links;
CREATE POLICY staff_user_links_read ON himoto.management_staff_user_links FOR SELECT TO himoto_scoped USING(EXISTS(SELECT 1 FROM himoto.staff_profiles p WHERE p.id=staff_id));
GRANT SELECT ON himoto.management_staff_user_links TO himoto_scoped;
CREATE OR REPLACE VIEW himoto.staff_account_attribution WITH (security_invoker=true) AS
  SELECT id,user_id,full_name,store_id FROM himoto.staff_profiles
  UNION ALL
  SELECT p.id,a.user_id,p.full_name,p.store_id FROM himoto.management_staff_user_links a JOIN himoto.staff_profiles p ON p.id=a.staff_id WHERE p.user_id IS DISTINCT FROM a.user_id;
GRANT SELECT ON himoto.staff_account_attribution TO himoto_scoped;
UPDATE himoto.management_account_access SET permissions=(SELECT jsonb_agg(DISTINCT permission) FROM jsonb_array_elements_text(permissions||'["accounts.manage","hr.read","hr.write"]'::jsonb) permission)
  WHERE access_role IN('branch_manager','ownership_manager');
COMMIT;
