import 'server-only';
import type { PoolClient } from 'pg';
import { displayedGpsState } from '@/lib/management/gps';
export function selectedVehicleIds(value:string){
  const values=value.split(',');
  if(!values.length||values.length>20||values.some(id=>!/^[1-9]\d{0,14}$/.test(id)))throw new Error('Chọn từ 1 đến 20 xe hợp lệ.');
  return [...new Set(values.map(Number))];
}
export async function readSelectedVehicleGps(db:Pick<PoolClient,'query'>,ids:number[]){
  const rows=(await db.query(`SELECT v.id AS vehicle_id,d.id AS device_id,d.management_status,d.provider_status,d.synced_at
    FROM himoto.vehicles v LEFT JOIN LATERAL (
      SELECT g.id,g.management_status,g.provider_status,CASE WHEN g.provider_status='not_visible_in_account' THEN g.sync_received_at ELSE COALESCE(a.last_success_at,g.sync_received_at) END AS synced_at
      FROM himoto.gps_devices g LEFT JOIN himoto.management_gps_accounts a ON a.id=g.source_account_id
      WHERE g.vehicle_id=v.id ORDER BY synced_at DESC NULLS LAST,g.id DESC LIMIT 1
    ) d ON true WHERE v.id=ANY($1::bigint[]) ORDER BY v.id`,[ids])).rows;
  return rows.map(row=>{const at=row.synced_at instanceof Date?row.synced_at.toISOString():row.synced_at||null;return {vehicle_id:Number(row.vehicle_id),status:!row.device_id?'none':displayedGpsState(row.provider_status==='not_visible_in_account'?'unavailable':row.management_status,at),synced_at:at};});
}
