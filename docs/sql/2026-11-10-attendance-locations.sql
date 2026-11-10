CREATE TABLE IF NOT EXISTS himoto.management_attendance_locations (
  store_id bigint PRIMARY KEY REFERENCES himoto.stores(id) ON DELETE CASCADE,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180)
);
