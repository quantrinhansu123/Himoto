import 'server-only';

// The stock state is recorded independently of a contract's settlement state.
// Preserve reconciled inventory even when a legacy contract remains open.
export const VEHICLE_STATUS_SQL = `CASE v.status
  WHEN 'rent' THEN 'using'
  WHEN 'maintenance' THEN 'repairing'
  WHEN 'holding' THEN 'pending'
  ELSE v.status END`;
