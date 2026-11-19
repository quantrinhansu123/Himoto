BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE UNIQUE INDEX IF NOT EXISTS management_shift_reports_store_date_type_uidx
  ON himoto.management_shift_reports (store_id, report_date, (COALESCE(payload->>'report_type', 'end_shift')));

ALTER TABLE himoto.management_shift_reports
  DROP CONSTRAINT IF EXISTS management_shift_reports_store_id_report_date_key;

COMMIT;
