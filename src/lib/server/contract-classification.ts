import 'server-only';

// Legacy store 30 contained battery rentals. Its orders remain as receipt/history
// anchors after import into battery_contracts; they never represent vehicle hire.
// A native vehicle order linked to a battery contract is still a vehicle order.
export const VEHICLE_ORDER_SQL = `COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','') <> '30'`;
