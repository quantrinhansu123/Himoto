BEGIN;
SET LOCAL lock_timeout='5s';
-- Every role may receive an explicit all-branch scope from an administrator.
-- Keep account_access_scope: enabled local accounts still require a branch.
-- This changes the constraint only; no existing account scope is changed.
ALTER TABLE himoto.management_account_access
  DROP CONSTRAINT IF EXISTS account_access_branch_scope;
COMMIT;
