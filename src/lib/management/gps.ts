export type GpsProvider='protrack'|'iopgps';
export type GpsState='online'|'stopped'|'offline'|'warning';
export const GPS_POLL_INTERVAL_MS=5000;
export const GPS_LONG_STOP_MS=3*24*60*60_000;
export const GPS_SYNC_STALE_MS=10*60_000;
export const GPS_STATE_LABELS:Record<GpsState|string,string>={online:'ON · Đang di chuyển',stopped:'ON · Đang dừng',long_stopped:'Xe dừng trên 3 ngày',offline:'OFF · Mất kết nối',warning:'Cần kiểm tra',stale:'Chưa cập nhật',none:'Chưa gắn GPS',unavailable:'Không còn trong tài khoản GPS'};
export interface GpsObservation {
  external_id:string;provider_device_id?:string;name:string;license:string;state:GpsState;provider_status:string;
  latitude:number|null;longitude:number|null;speed:number|null;ignition:boolean|null;
  recorded_at:string|null;heartbeat_at:string|null;reported_at?:string|null;
  provider_stopped_since?:string|null;
}
export interface GpsVehicle {
  id:number;vehicle_id:number|null;provider:GpsProvider|null;external_device_id:string;provider_device_name:string;
  license:string|null;store_id:number|null;store_name:string|null;management_status:GpsState|'unavailable'|'none'|null;
  sync_received_at:string|null;heartbeat_at:string|null;last_latitude:number|null;last_longitude:number|null;last_speed:number|null;
  mapping_status:string;
  position_recorded_at?:string|null;provider_reported_at?:string|null;last_ignition?:boolean|null;
  stopped_since?:string|null;
  provider_stopped_since?:string|null;
}
export const normalizeGpsPlate=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function matchingGpsVehicles(name:string,license:string,vehicles:{id:number;license:string}[]) {
  const keys=new Set([normalizeGpsPlate(name),normalizeGpsPlate(license),...(name.toUpperCase().match(/\b\d{2}[A-Z]{1,2}\d?[- .]?\d{3}[. -]?\d{2}\b/g)||[]).map(normalizeGpsPlate)]);
  return vehicles.filter(vehicle=>vehicle.license&&keys.has(normalizeGpsPlate(vehicle.license)));
}
export function displayedGpsState(state:string|null,syncedAt:string|null,now=Date.now()) {
  if(state==='unavailable')return 'unavailable';
  if(state==='none')return 'none';
  if(!syncedAt||!Number.isFinite(Date.parse(syncedAt))||now-Date.parse(syncedAt)>GPS_SYNC_STALE_MS)return 'stale';
  return state||'warning';
}
export function gpsStopEvidence(row:GpsVehicle,now=Date.now()):{since:string;source:'protrack'|'observed'}|null {
  if(displayedGpsState(row.management_status,row.sync_received_at,now)!=='stopped')return null;
  const synced=Date.parse(row.sync_received_at||'');
  const valid=(value:string|null|undefined)=>Boolean(value&&Number.isFinite(Date.parse(value))&&Date.parse(value)>=Date.UTC(2000,0,1)&&Date.parse(value)<=now&&Date.parse(value)<=synced);
  if(row.provider==='protrack'&&valid(row.provider_stopped_since))return {since:row.provider_stopped_since!,source:'protrack'};
  return valid(row.stopped_since)?{since:row.stopped_since!,source:'observed'}:null;
}
export function gpsStoppedDurationMs(row:GpsVehicle,now=Date.now()):number|null {
  const evidence=gpsStopEvidence(row,now);
  return evidence?now-Date.parse(evidence.since):null;
}
/** One vehicle is flagged only when all of its currently available devices agree. */
export function longStoppedVehicleIds(rows:GpsVehicle[],now=Date.now()):Set<number> {
  const groups=new Map<number,GpsVehicle[]>();
  for(const row of rows)if(row.vehicle_id!==null&&row.management_status!=='unavailable'&&row.management_status!=='none'){
    const devices=groups.get(row.vehicle_id)||[];devices.push(row);groups.set(row.vehicle_id,devices);
  }
  return new Set([...groups].filter(([,devices])=>devices.every(row=>(gpsStoppedDurationMs(row,now)??0)>GPS_LONG_STOP_MS)).map(([id])=>id));
}
export function gpsMapLink(latitude:number|null,longitude:number|null) {
  if(latitude===null||longitude===null||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return null;
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}
