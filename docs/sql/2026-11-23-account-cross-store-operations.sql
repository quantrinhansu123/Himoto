ALTER TABLE himoto.management_account_access
  ADD COLUMN IF NOT EXISTS scope_all_operations boolean NOT NULL DEFAULT false;
