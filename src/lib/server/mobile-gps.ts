import 'server-only';
import type {NextRequest} from 'next/server';
import type {SessionUser} from './management-session';
import {hasPermission,isAdminAccount} from '@/lib/management/permissions';
import {withMobileData} from './mobile-context';
import {himotoPool} from './himoto-database';
import {MobileError} from './mobile-session';
import {readGpsWorkspace} from './gps-workspace';
import {parseGpsQuery,projectGpsRows,isMobileGpsWorkspace,type MobileGpsWorkspace} from '../../../shared/mobile-gps';
import type {GpsVehicle} from '../management/gps';

export function requireMobileGps(user:SessionUser,mapping=false) {
  if(!hasPermission(user,'vehicles.read')||mapping&&!isAdminAccount(user))throw new MobileError(mapping?'Chỉ quản trị được ghép GPS với xe.':'Tài khoản không có quyền xem GPS.',403,'FORBIDDEN');
}
const iso=(v:unknown)=>v==null?null:v instanceof Date?v.toISOString():new Date(String(v)).toISOString();
const label=(v:unknown)=>v==null?'':String(v).slice(0,4000);
async function readGpsSnapshot(user:SessionUser,request:NextRequest) {
  requireMobileGps(user);
  let query;try{query=parseGpsQuery(request.nextUrl.searchParams);}catch{throw new MobileError('Bộ lọc GPS không hợp lệ.',400,'INVALID_GPS_QUERY');}
  return withMobileData(user,'fleet_read',async()=>{
    const db=await himotoPool.connect();
    try{
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await db.query("SET LOCAL statement_timeout='20s'");
      const raw=await readGpsWorkspace(db,query.store,query.event_source,query.event_device);
      const rows=raw.devices.map(row=>({
        id:row.id,vehicle_id:row.vehicle_id,provider:row.provider,external_device_id:label(row.external_device_id),provider_device_name:label(row.provider_device_name),
        license:row.license==null?null:label(row.license),store_id:row.store_id,store_name:row.store_name==null?null:label(row.store_name),
        mapping_status:label(row.mapping_status),management_status:row.management_status,sync_received_at:iso(row.sync_received_at),heartbeat_at:iso(row.heartbeat_at),
        position_recorded_at:iso(row.position_recorded_at),provider_reported_at:iso(row.provider_reported_at),stopped_since:iso(row.stopped_since),
        provider_stopped_since:iso(row.provider_stopped_since),last_latitude:row.last_latitude,last_longitude:row.last_longitude,last_speed:row.last_speed,last_ignition:row.last_ignition??null,
      })) as GpsVehicle[];
      const stores=await db.query('SELECT id,store_name FROM himoto.stores ORDER BY store_name,id');
      const now=Date.now();
      const result={query,rows,now,stores:stores.rows.map(r=>({id:Number(r.id),name:label(r.store_name)})),
        eventDevices:rows.filter(r=>r.id>0).map(r=>({id:r.id,label:r.license||r.provider_device_name||r.external_device_id})),
        events:raw.events.map(e=>({id:Number(e.id),vehicleId:e.vehicle_id==null?null:Number(e.vehicle_id),fromStatus:e.from_status??null,toStatus:label(e.to_status),
          kind:label(e.event_kind),source:e.source,eventAt:iso(e.event_at)!,observedAt:iso(e.observed_at)!,label:label(e.license)})),
        canMap:isAdminAccount(user),observedAt:new Date(now).toISOString()};
      await db.query('COMMIT');return result;
    }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
  });
}

export async function readMobileGps(user:SessionUser,request:NextRequest):Promise<MobileGpsWorkspace>{
  const {rows,now,...snapshot}=await readGpsSnapshot(user,request),result={...snapshot,...projectGpsRows(rows,snapshot.query,now)};
  if(!isMobileGpsWorkspace(result,snapshot.query))throw new MobileError('Dữ liệu GPS cần được kiểm tra. Giữ nguyên bộ lọc và tải lại.',503,'INVALID_GPS_DATA');
  return result;
}
export async function readMobileGpsExportRows(user:SessionUser,request:NextRequest){
  const {rows,query,now}=await readGpsSnapshot(user,request);return projectGpsRows(rows,query,now,true).rows;
}
