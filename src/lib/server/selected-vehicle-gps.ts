import 'server-only';
import type { PoolClient } from 'pg';
import { displayedGpsState } from '@/lib/management/gps';
import { VEHICLE_GPS_JOIN_SQL } from './vehicle-gps-query';
export function selectedVehicleIds(value:string){
  const values=value.split(',');
  if(!values.length||values.length>20||values.some(id=>!/^[1-9]\d{0,14}$/.test(id)))throw new Error('Chọn từ 1 đến 20 xe hợp lệ.');
  return [...new Set(values.map(Number))];
}
export async function readSelectedVehicleGps(db:Pick<PoolClient,'query'>,ids:number[]){
  const rows=(await db.query(`SELECT v.id AS vehicle_id,gps.device_id,gps.normalized_status,gps.synced_at,gps.heartbeat_at,gps.position_recorded_at
    FROM himoto.vehicles v ${VEHICLE_GPS_JOIN_SQL} WHERE v.id=ANY($1::bigint[]) ORDER BY v.id`,[ids])).rows;
  const iso=(value:unknown)=>value instanceof Date?value.toISOString():value?String(value):null;
  return rows.map(row=>{const at=iso(row.synced_at);return {vehicle_id:Number(row.vehicle_id),status:!row.device_id?'none':displayedGpsState(row.normalized_status,at),synced_at:at,heartbeat_at:iso(row.heartbeat_at),position_at:iso(row.position_recorded_at)};});
}
