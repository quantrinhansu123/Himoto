BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE himoto.customers
  ADD COLUMN IF NOT EXISTS driver_license_number varchar(100),
  ADD COLUMN IF NOT EXISTS driver_license_issued_on date;

ALTER TABLE himoto.vehicles
  ADD COLUMN IF NOT EXISTS daily_price bigint,
  ADD COLUMN IF NOT EXISTS monthly_price bigint;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_daily_price_nonnegative') THEN
    ALTER TABLE himoto.vehicles ADD CONSTRAINT vehicles_daily_price_nonnegative CHECK (daily_price IS NULL OR daily_price >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_monthly_price_nonnegative') THEN
    ALTER TABLE himoto.vehicles ADD CONSTRAINT vehicles_monthly_price_nonnegative CHECK (monthly_price IS NULL OR monthly_price >= 0);
  END IF;
END $$;

COMMIT;
