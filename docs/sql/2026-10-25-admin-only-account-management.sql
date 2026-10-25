BEGIN;
SET LOCAL lock_timeout='5s';
-- Set himoto.actor_id to the acting administrator inside the transaction.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM himoto.users u LEFT JOIN himoto.management_account_access a ON a.user_id=u.id
    WHERE u.id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint AND u.status='active' AND u.deleted_at IS NULL
      AND (a.access_role='admin' AND a.enabled OR a.user_id IS NULL AND u.role_id=1))
  THEN RAISE EXCEPTION 'An active administrator actor is required for this migration'; END IF;
END $$;
-- Withdraw only this delegated privilege; keep roles, scopes and all other grants.
WITH changed AS (
  UPDATE himoto.management_account_access
  SET permissions=permissions-'accounts.manage',updated_at=now()
  WHERE access_role<>'admin' AND permissions ? 'accounts.manage'
  RETURNING user_id,access_role
)
INSERT INTO himoto.management_access_audit(actor_id,target_user_id,action,after_value)
SELECT NULLIF(current_setting('himoto.actor_id',true),'')::bigint,user_id,'admin_only_permissions',jsonb_build_object('access_role',access_role,'removed_permission','accounts.manage') FROM changed;
ALTER TABLE himoto.management_account_access DROP CONSTRAINT IF EXISTS account_access_admin_management;
ALTER TABLE himoto.management_account_access ADD CONSTRAINT account_access_admin_management
  CHECK(access_role='admin' OR NOT (permissions ? 'accounts.manage'));
COMMIT;
