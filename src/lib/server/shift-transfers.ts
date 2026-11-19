import 'server-only';
import type { PoolClient } from 'pg';
import type { ShiftTransfer } from '@/lib/management/shift-autofill';

export async function readShiftTransfers(db: Pick<PoolClient, 'query'>, store: number, date: string): Promise<ShiftTransfer[]> {
  const { rows } = await db.query(`SELECT e.id::text, e.vehicle_id::text, v.license AS plate,
    e.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS created_at,
    COALESCE(e.audit_snapshot->>'from_store_name',fs.store_name,e.from_store_id::text) AS "from",
    COALESCE(e.audit_snapshot->>'to_store_name',ts.store_name,e.to_store_id::text) AS "to",
    CASE WHEN e.from_store_id=$1 THEN 'out' ELSE 'in' END AS direction,
    CASE resolution.event_type
      WHEN 'manual_transfer_receive' THEN 'received'
      WHEN 'transfer_receive' THEN 'received'
      WHEN 'manual_transfer_reject' THEN 'rejected'
      WHEN 'manual_transfer_cancel' THEN 'cancelled'
      ELSE 'pending' END AS status,
    resolution.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS resolved_at
    FROM himoto.vehicle_location_events e JOIN himoto.vehicles v ON v.id=e.vehicle_id
    LEFT JOIN himoto.stores fs ON fs.id=e.from_store_id LEFT JOIN himoto.stores ts ON ts.id=e.to_store_id
    LEFT JOIN LATERAL (
      SELECT r.event_type,r.created_at FROM himoto.vehicle_location_events r
      WHERE r.vehicle_id=e.vehicle_id AND r.id>e.id AND (
        (e.event_type='manual_transfer' AND r.ref_type='vehicle_location_events' AND r.ref_id=e.id
          AND r.event_type IN ('manual_transfer_receive','manual_transfer_reject','manual_transfer_cancel'))
        OR (e.event_type='transfer_dispatch' AND e.ref_type='vehicle_transfers'
          AND r.ref_type=e.ref_type AND r.ref_id=e.ref_id AND r.event_type='transfer_receive')
      )
      AND COALESCE(r.audit_snapshot #>> '{reconciliation,superseded}','false')<>'true'
      ORDER BY r.id DESC LIMIT 1
    ) resolution ON true
    WHERE (e.from_store_id=$1 OR e.to_store_id=$1) AND e.event_type IN('manual_transfer','transfer_dispatch')
    AND COALESCE(e.audit_snapshot #>> '{reconciliation,superseded}','false')<>'true'
    AND e.created_at >= $2::date::timestamp
    AND e.created_at < ($2::date+1)::timestamp
    ORDER BY e.id`, [store,date]);
  return rows.map(({created_at,resolved_at,...row}) => ({
    ...row,at:new Date(created_at).toISOString(),
    resolved_at:resolved_at ? new Date(resolved_at).toISOString() : null,
  }));
}
