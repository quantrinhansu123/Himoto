BEGIN;
SET LOCAL lock_timeout = '5s';

-- Display name for a cash box; empty keeps the generated "Két tiền mặt #<id>" label.
ALTER TABLE himoto.cash ADD COLUMN IF NOT EXISTS name varchar(191);

COMMIT;
