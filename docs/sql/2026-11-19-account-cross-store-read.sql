ALTER TABLE himoto.management_account_access
  ADD COLUMN IF NOT EXISTS scope_all_read boolean NOT NULL DEFAULT false;
