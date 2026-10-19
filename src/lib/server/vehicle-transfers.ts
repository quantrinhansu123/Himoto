import 'server-only';
import type { PoolClient } from 'pg';

const SELECT_TRANSFER = `SELECT e.id,e.event_type,e.from_store_id,e.to_store_id,e.created_by,
  COALESCE(NULLIF(e.audit_snapshot->>'from_store_name',''),fs.store_name,'') AS from_store_name,
  COALESCE(NULLIF(e.audit_snapshot->>'to_store_name',''),ts.store_name,'') AS to_store_name,
  CASE WHEN e.event_type='manual_transfer'
    AND COALESCE(e.audit_snapshot #> '{reconciliation,superseded}','false'::jsonb)<>'true'::jsonb AND NOT EXISTS (
    SELECT 1 FROM himoto.vehicle_location_events r WHERE r.vehicle_id=e.vehicle_id
      AND r.event_type='manual_transfer_receive' AND r.ref_type='vehicle_location_events' AND r.ref_id=e.id
  ) THEN 1 ELSE 0 END AS receivable
  FROM himoto.vehicle_location_events e
  LEFT JOIN himoto.stores fs ON fs.id=e.from_store_id LEFT JOIN himoto.stores ts ON ts.id=e.to_store_id`;

export const VEHICLE_TRANSFER_JOIN_SQL = `LEFT JOIN LATERAL (
  ${SELECT_TRANSFER} WHERE e.vehicle_id=v.id AND e.event_type IN ('manual_transfer','transfer_dispatch')
  ORDER BY e.id DESC LIMIT 1
) pending_transfer ON v.status='in_transit'`;

export async function readPendingVehicleTransfer(client:Pick<PoolClient,'query'>,vehicleId:number) {
  return (await client.query(`${SELECT_TRANSFER} WHERE e.vehicle_id=$1 AND e.event_type IN ('manual_transfer','transfer_dispatch')
    ORDER BY e.id DESC LIMIT 1 FOR UPDATE OF e`,[vehicleId])).rows[0];
}
