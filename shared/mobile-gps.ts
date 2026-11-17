import {displayedGpsState,longStoppedVehicleIds,gpsStoppedDurationMs,GPS_LONG_STOP_MS,type GpsVehicle} from './gps';
export {GPS_POLL_INTERVAL_MS,GPS_SYNC_STALE_MS,GPS_STATE_LABELS,gpsMapLink,gpsStopEvidence,gpsStoppedDurationMs,displayedGpsState} from './gps';

export const GPS_FILTER_STATES=['all','online','stopped','long_stopped','offline','warning','stale','none','unavailable'] as const;
export const GPS_VEHICLE_STATUSES=['all','ready','using','repairing','pending','sold','bad_debt','broken','in_transit'] as const;
export type MobileGpsState=Exclude<typeof GPS_FILTER_STATES[number],'all'>;
export interface MobileGpsQuery {store:string;provider:'all'|'protrack'|'iopgps';state:typeof GPS_FILTER_STATES[number];vehicle_status:typeof GPS_VEHICLE_STATUSES[number];search:string;page:number;event_source:'all'|'poll'|'history'|'webhook';event_device:string}
export const defaultGpsQuery:MobileGpsQuery={store:'all',provider:'all',state:'all',vehicle_status:'all',search:'',page:1,event_source:'all',event_device:''};
export interface MobileGpsRow extends GpsVehicle {displayState:MobileGpsState}
export interface MobileGpsEvent {id:number;vehicleId:number|null;fromStatus:string|null;toStatus:string;kind:string;source:'poll'|'history'|'webhook';eventAt:string;observedAt:string;label:string}
export type MobileGpsHistoryQuery=Pick<MobileGpsQuery,'store'|'event_source'|'event_device'>;
export interface MobileGpsHistory {query:MobileGpsHistoryQuery;events:MobileGpsEvent[];observedAt:string}
export interface MobileGpsEventOptions {store:string;devices:{id:number;label:string}[]}
export interface MobileGpsSyncState {
  inProgress:boolean;enabledAccounts:number;failedAccounts:number;
  lastFinishedAt:string|null;latestSuccessAt:string|null;oldestSuccessAt:string|null;nextAttemptAt:string|null;
}
export interface MobileGpsSyncRequest {status:'queued'|'running'|'not_due'|'unconfigured';requestedAt:string;state:MobileGpsSyncState}
export interface MobileGpsWorkspace {
  query:MobileGpsQuery;page:number;pageSize:25;total:number;hasMore:boolean;rows:MobileGpsRow[];
  summary:{fleet:number;unmapped:number;devices:number;states:Record<MobileGpsState,number>};
  stores:{id:number;name:string}[];eventDevices:{id:number;label:string}[];events:MobileGpsEvent[];
  canMap:boolean;observedAt:string;
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export const gpsId=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=999999999999999;
const idText=(v:unknown)=>typeof v==='string'&&/^[1-9]\d{0,14}$/.test(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.length<=4000;
const date=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const nullableDate=(v:unknown)=>v===null||v===undefined||date(v);
const nonnegative=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
export function parseGpsHistoryQuery(params:URLSearchParams):MobileGpsHistoryQuery {
  for(const [key]of params)if(!['store','event_source','event_device'].includes(key))throw Error('INVALID_GPS_QUERY');
  const query=parseGpsQuery(params);
  return {store:query.store,event_source:query.event_source,event_device:query.event_device};
}
export function isMobileGpsEvent(v:unknown):v is MobileGpsEvent {
  return object(v)&&gpsId(v.id)&&(v.vehicleId===null||gpsId(v.vehicleId))&&(v.fromStatus===null||text(v.fromStatus))&&
    text(v.toStatus)&&text(v.kind)&&['poll','history','webhook'].includes(String(v.source))&&date(v.eventAt)&&date(v.observedAt)&&text(v.label);
}
export function isMobileGpsHistory(v:unknown,expected:MobileGpsHistoryQuery):v is MobileGpsHistory {
  return object(v)&&object(v.query)&&Object.keys(v.query).length===3&&
    ['store','event_source','event_device'].every(k=>v.query&&object(v.query)&&v.query[k]===expected[k as keyof MobileGpsHistoryQuery])&&
    date(v.observedAt)&&Array.isArray(v.events)&&v.events.length<=100&&v.events.every(isMobileGpsEvent)&&new Set(v.events.map(e=>e.id)).size===v.events.length;
}
export function isMobileGpsEventOptions(v:unknown,store:string):v is MobileGpsEventOptions {
  return object(v)&&v.store===store&&Array.isArray(v.devices)&&v.devices.every(d=>object(d)&&gpsId(d.id)&&text(d.label))&&new Set(v.devices.map(d=>d.id)).size===v.devices.length;
}
export function isMobileGpsSyncState(v:unknown):v is MobileGpsSyncState {
  return object(v)&&typeof v.inProgress==='boolean'&&nonnegative(v.enabledAccounts)&&nonnegative(v.failedAccounts)&&v.failedAccounts<=v.enabledAccounts&&
    ['lastFinishedAt','latestSuccessAt','oldestSuccessAt','nextAttemptAt'].every(k=>v[k]===null||date(v[k]));
}
export function isMobileGpsSyncRequest(v:unknown):v is MobileGpsSyncRequest {
  return object(v)&&['queued','running','not_due','unconfigured'].includes(String(v.status))&&date(v.requestedAt)&&isMobileGpsSyncState(v.state);
}
export function parseGpsQuery(params:URLSearchParams):MobileGpsQuery {
  const allowed=Object.keys(defaultGpsQuery);
  for(const [key] of params)if(!allowed.includes(key)||params.getAll(key).length!==1)throw Error('INVALID_GPS_QUERY');
  const result={...defaultGpsQuery,...Object.fromEntries(params),page:Number(params.get('page')||1)} as MobileGpsQuery;
  if(result.store!=='all'&&!idText(result.store)||!['all','protrack','iopgps'].includes(result.provider)||!GPS_FILTER_STATES.includes(result.state)||!GPS_VEHICLE_STATUSES.includes(result.vehicle_status)||
    result.search.length>120||/[\u0000-\u001f\u007f]/.test(result.search)||!gpsId(result.page)||result.page>100000||
    !['all','poll','history','webhook'].includes(result.event_source)||result.event_device!==''&&!idText(result.event_device))throw Error('INVALID_GPS_QUERY');
  return result;
}
export function gpsQueryString(query:MobileGpsQuery) {return new URLSearchParams({...query,page:String(query.page)}).toString();}
export function matchesGpsQuery(a:MobileGpsQuery,b:MobileGpsQuery) {return Object.keys(defaultGpsQuery).every(key=>a[key as keyof MobileGpsQuery]===b[key as keyof MobileGpsQuery]);}
export function projectGpsRows(rows:GpsVehicle[],query:MobileGpsQuery,now:number,allRows=false) {
  const long=longStoppedVehicleIds(rows,now);
  const projected=rows.map(row=>({...row,displayState:(displayedGpsState(row.management_status,row.sync_received_at,now)==='stopped'&&row.vehicle_id!==null&&long.has(row.vehicle_id)?'long_stopped':displayedGpsState(row.management_status,row.sync_received_at,now)) as MobileGpsState}));
  const states=Object.fromEntries(GPS_FILTER_STATES.filter(v=>v!=='all').map(v=>[v,v==='long_stopped'?long.size:projected.filter(r=>r.displayState===v).length])) as Record<MobileGpsState,number>;
  const search=query.search.toLowerCase();
  const filtered=projected.filter(r=>(query.provider==='all'||r.provider===query.provider)&&(query.state==='all'||r.displayState===query.state)&&(query.vehicle_status==='all'||r.vehicle_status===query.vehicle_status)&&
    [r.license,r.provider_device_name,r.external_device_id,r.store_name].some(v=>(v||'').toLowerCase().includes(search)));
  const page=Math.min(query.page,Math.max(1,Math.ceil(filtered.length/25)));
  return {page,pageSize:25 as const,total:filtered.length,hasMore:page*25<filtered.length,rows:allRows?filtered:filtered.slice((page-1)*25,page*25),
    summary:{fleet:new Set(rows.map(r=>r.vehicle_id).filter(v=>v!==null)).size,unmapped:rows.filter(r=>r.vehicle_id===null).length,devices:rows.length,states}};
}
function isGpsRow(v:unknown):v is MobileGpsRow {
  return object(v)&&typeof v.id==='number'&&gpsId(Math.abs(v.id))&&(v.vehicle_id===null||gpsId(v.vehicle_id))&&
    (v.id>0||v.vehicle_id===-v.id&&v.management_status==='none')&&['protrack','iopgps',null].includes(v.provider as string|null)&&
    text(v.external_device_id)&&text(v.provider_device_name)&&(v.license===null||text(v.license))&&(v.store_id===null||gpsId(v.store_id))&&
    (v.store_name===null||text(v.store_name))&&['online','stopped','offline','warning','none','unavailable',null].includes(v.management_status as string|null)&&
    GPS_FILTER_STATES.includes(v.displayState as MobileGpsState)&&v.displayState!=='all'&&text(v.mapping_status)&&
    ['sync_received_at','heartbeat_at','position_recorded_at','provider_reported_at','stopped_since','provider_stopped_since'].every(k=>nullableDate(v[k]))&&
    ['last_latitude','last_longitude','last_speed'].every(k=>v[k]===null||typeof v[k]==='number'&&Number.isFinite(v[k]))&&
    (v.last_ignition===undefined||v.last_ignition===null||typeof v.last_ignition==='boolean');
}
export function isMobileGpsWorkspace(v:unknown,expected?:MobileGpsQuery):v is MobileGpsWorkspace {
  if(!object(v)||!object(v.query))return false;
  let query:MobileGpsQuery;try{query=parseGpsQuery(new URLSearchParams(Object.entries(v.query).map(([k,val])=>[k,String(val)])));}catch{return false;}
  if(Object.keys(v.query).length!==Object.keys(defaultGpsQuery).length||!matchesGpsQuery(v.query as unknown as MobileGpsQuery,query)||expected&&!matchesGpsQuery(query,expected)||
    !gpsId(v.page)||v.page>query.page||v.pageSize!==25||!nonnegative(v.total)||v.page!==Math.min(query.page,Math.max(1,Math.ceil(v.total/25)))||
    typeof v.hasMore!=='boolean'||v.hasMore!==(v.page*25<v.total)||!Array.isArray(v.rows)||v.rows.length!==Math.min(25,Math.max(0,v.total-(v.page-1)*25))||
    !v.rows.every(isGpsRow)||new Set(v.rows.map(r=>r.id)).size!==v.rows.length||!object(v.summary)||!object(v.summary.states)||
    !['fleet','unmapped','devices'].every(k=>nonnegative((v.summary as Record<string,unknown>)[k]))||
    !GPS_FILTER_STATES.filter(s=>s!=='all').every(s=>nonnegative((v.summary as {states:Record<string,unknown>}).states[s]))||
    !Array.isArray(v.stores)||!v.stores.every(s=>object(s)&&gpsId(s.id)&&text(s.name))||new Set(v.stores.map(s=>s.id)).size!==v.stores.length||
    !Array.isArray(v.eventDevices)||!v.eventDevices.every(s=>object(s)&&gpsId(s.id)&&text(s.label))||new Set(v.eventDevices.map(s=>s.id)).size!==v.eventDevices.length||
    !Array.isArray(v.events)||v.events.length>100||!v.events.every(isMobileGpsEvent)||
    new Set(v.events.map(e=>e.id)).size!==v.events.length||typeof v.canMap!=='boolean'||!date(v.observedAt))return false;
  const observed=Date.parse(v.observedAt),search=query.search.toLowerCase();
  return v.rows.every(r=>{
    const base=displayedGpsState(r.management_status,r.sync_received_at,observed);
    return (r.displayState==='long_stopped'?base==='stopped'&&(gpsStoppedDurationMs(r,observed)??0)>GPS_LONG_STOP_MS:r.displayState===base)&&
      (query.store==='all'||String(r.store_id)===query.store)&&(query.provider==='all'||r.provider===query.provider)&&(query.state==='all'||r.displayState===query.state)&&(query.vehicle_status==='all'||r.vehicle_status===query.vehicle_status)&&
      [r.license,r.provider_device_name,r.external_device_id,r.store_name].some(t=>(t||'').toLowerCase().includes(search));
  });
}
