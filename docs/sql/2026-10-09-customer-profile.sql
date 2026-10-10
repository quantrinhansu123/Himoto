BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE himoto.customers
  ADD COLUMN IF NOT EXISTS driver_license_number varchar(100),
  ADD COLUMN IF NOT EXISTS driver_license_issued_on date;

COMMIT;
