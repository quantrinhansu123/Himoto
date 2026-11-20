BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE himoto.management_shift_media DROP CONSTRAINT IF EXISTS management_shift_media_category_check;
ALTER TABLE himoto.management_shift_media ADD CONSTRAINT management_shift_media_category_check
  CHECK (category IN ('vehicles','batteries','cash','personal','company','door')
    OR (category = 'vehicle_stock' AND stage = 'pgd' AND mime_type = 'image/jpeg'));
ALTER TABLE himoto.management_attendance_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shift_stock_attendance_location ON himoto.management_attendance_locations;
CREATE POLICY shift_stock_attendance_location ON himoto.management_attendance_locations
  FOR SELECT TO himoto_scoped USING (himoto.access_store(store_id));
GRANT SELECT (store_id, latitude, longitude) ON himoto.management_attendance_locations TO himoto_scoped;
COMMIT;
