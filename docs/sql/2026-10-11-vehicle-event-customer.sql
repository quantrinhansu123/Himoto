-- Customer details captured when a vehicle is marked Đang thuê / Lưu kho from "Hành động xe".
ALTER TABLE himoto.vehicle_location_events
  ADD COLUMN IF NOT EXISTS customer_name varchar(191),
  ADD COLUMN IF NOT EXISTS customer_phone varchar(32),
  ADD COLUMN IF NOT EXISTS customer_id_card varchar(32);
