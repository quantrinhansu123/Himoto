export type GpsProvider='protrack'|'iopgps';
export type GpsState='online'|'stopped'|'offline'|'warning';
export const GPS_POLL_INTERVAL_MS=5000;
export const GPS_STATE_LABELS:Record<GpsState|string,string>={online:'ON · Đang di chuyển',stopped:'Dừng',offline:'OFF · Mất kết nối',warning:'Cần kiểm tra',stale:'Chưa cập nhật',none:'Chưa gắn GPS'};
export interface GpsObservation {
  external_id:string;name:string;license:string;state:GpsState;provider_status:string;
  latitude:number|null;longitude:number|null;speed:number|null;ignition:boolean|null;
  recorded_at:string|null;heartbeat_at:string|null;
}
export interface GpsVehicle {
  id:number;vehicle_id:number|null;provider:GpsProvider;external_device_id:string;provider_device_name:string;
  license:string|null;store_id:number|null;store_name:string|null;management_status:GpsState|null;
  sync_received_at:string|null;heartbeat_at:string|null;last_latitude:number|null;last_longitude:number|null;last_speed:number|null;
  mapping_status:string;
}
export const normalizeGpsPlate=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function matchingGpsVehicles(name:string,license:string,vehicles:{id:number;license:string}[]) {
  const keys=new Set([normalizeGpsPlate(name),normalizeGpsPlate(license),...(name.toUpperCase().match(/\b\d{2}[A-Z]{1,2}\d?[- .]?\d{3}[. -]?\d{2}\b/g)||[]).map(normalizeGpsPlate)]);
  return vehicles.filter(vehicle=>vehicle.license&&keys.has(normalizeGpsPlate(vehicle.license)));
}
export function displayedGpsState(state:string|null,syncedAt:string|null,now=Date.now()) {
  if(!syncedAt||!Number.isFinite(Date.parse(syncedAt))||now-Date.parse(syncedAt)>10*60_000)return 'stale';
  return state||'warning';
}
export function gpsMapLink(latitude:number|null,longitude:number|null) {
  if(latitude===null||longitude===null||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return null;
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}
