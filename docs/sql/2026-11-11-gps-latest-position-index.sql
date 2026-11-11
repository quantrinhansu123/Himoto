-- Run outside a transaction. gps-sync reads the latest row for every device.
-- The old ascending index scanned backwards gives DESC NULLS FIRST; the query
-- needs DESC NULLS LAST and otherwise sorts thousands of heap rows per device.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gps_positions_latest_cover
ON himoto.gps_positions (gps_device_id,provider_recorded_at DESC NULLS LAST)
INCLUDE (normalized_status,received_at);
