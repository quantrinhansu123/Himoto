import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';

export type GpsEventKind='motion'|'connection_online'|'connection_offline'|'ignition_on'|'ignition_off';
export interface GpsHistoryPoint {at:string;speed:number}
export interface GpsProviderEvent {at:string;kind:GpsEventKind;state:'online'|'stopped'|'offline'|null;nativeId?:string;providerStatus:string}
export type GpsEventDatabase=Pick<PoolClient,'query'>;
export function gpsEventTime(value:unknown):string|null {
  if(typeof value!=='number'&&typeof value!=='string')return null;
  const number=Number(value),ms=number>0?(number<1e12?number*1000:number):NaN;
  if(!Number.isFinite(ms)||ms<Date.UTC(2000,0,1)||ms>Date.now()+300_000)return null;
  return new Date(ms).toISOString();
}
const iopKinds:Record<number,[GpsEventKind,GpsProviderEvent['state']]>= {
  4:['motion','online'],62:['motion','online'],72:['motion','stopped'],
  25:['connection_online',null],27:['connection_offline','offline'],44:['ignition_on',null],45:['ignition_off',null],
};
const protrackKinds:Record<number,[GpsEventKind,GpsProviderEvent['state']]>= {
  8:['motion','online'],28:['connection_offline','offline'],9:['ignition_on',null],10:['ignition_off',null],
};
export function gpsAlarmEvent(provider:'protrack'|'iopgps',type:unknown,time:unknown,id:unknown):GpsProviderEvent|null {
  const mapping=(provider==='iopgps'?iopKinds:protrackKinds)[Number(type)],at=gpsEventTime(time);
  if(!mapping)return null;
  if(!at)throw new Error('GPS_EVENT_TIME');
  const nativeId=id==null?undefined:String(id);
  if(nativeId&&nativeId.length>191)throw new Error('GPS_EVENT_ID');
  return {kind:mapping[0],state:mapping[1],at,nativeId,providerStatus:`${provider}:alarm:${Number(type)}`};
}
export async function persistGpsProviderEvents(database:GpsEventDatabase,deviceId:number,events:GpsProviderEvent[],source:'history'|'webhook') {
  if(events.length>20000)throw new Error('GPS_EVENTS_LIMIT');
  const rows=events.map(event=>{
    if(!gpsEventTime(Date.parse(event.at)))throw new Error('GPS_EVENT_TIME');
    const key=createHash('sha256').update([event.kind,event.at,event.state||'',event.nativeId||''].join('|')).digest('hex');
    return {...event,key};
  });
  if(!rows.length)return 0;
  const result=await database.query(`INSERT INTO himoto.management_gps_status_events
    (gps_device_id,vehicle_id,to_status,event_kind,source,source_event_key,provider_recorded_at,provider_status)
    SELECT d.id,d.vehicle_id,x.state,x.kind,$3,x.key,x.at,x."providerStatus"
    FROM himoto.gps_devices d CROSS JOIN jsonb_to_recordset($2::jsonb) AS x(state text,kind text,key text,at timestamptz,"providerStatus" text)
    WHERE d.id=$1 ON CONFLICT(gps_device_id,source_event_key) WHERE source_event_key IS NOT NULL DO NOTHING`,[deviceId,JSON.stringify(rows),source]);
  // Recovered movement/offline events can interrupt a stop between two polls.
  // Clear only the duration evidence; provider history never overwrites current state.
  if(result.rowCount)await database.query(`UPDATE himoto.gps_devices d SET stopped_since=NULL
    WHERE d.id=$1 AND d.stopped_since IS NOT NULL AND EXISTS (
      SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS x(state text,at timestamptz)
      WHERE x.state IN('online','offline') AND x.at>=d.stopped_since
    )`,[deviceId,JSON.stringify(rows)]);
  return result.rowCount||0;
}
export async function persistGpsMotionHistory(database:GpsEventDatabase,deviceId:number,points:GpsHistoryPoint[],windowStart:string) {
  const prior=(await database.query(`SELECT to_status FROM himoto.management_gps_status_events
    WHERE gps_device_id=$1 AND event_kind='motion' AND provider_recorded_at<$2
    ORDER BY provider_recorded_at DESC,id DESC LIMIT 1`,[deviceId,windowStart])).rows[0];
  let previous=prior?.to_status as string|undefined;
  const events:GpsProviderEvent[]=[];
  for(const point of [...points].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))) {
    if(!Number.isFinite(point.speed)||point.speed<0||!gpsEventTime(Date.parse(point.at)))throw new Error('GPS_HISTORY_POINT');
    const state=point.speed>0?'online':'stopped';
    if(previous!==state)events.push({at:point.at,kind:'motion',state,providerStatus:'history:speed'});
    previous=state;
  }
  return persistGpsProviderEvents(database,deviceId,events,'history');
}

export interface IopWebhookRecord {id:string;imei:string;triggerTime:number;triggerConditions:{alarmType:number}[];conditionType:number}
export function parseIopWebhookRecord(raw:unknown):IopWebhookRecord {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('GPS_WEBHOOK_BODY');
  const value=raw as Record<string,unknown>,id=String(value.id??''),imei=String(value.imei??''),time=Number(value.triggerTime);
  if(!/^[\w-]{1,100}$/.test(id)||!/^\d{5,20}$/.test(imei)||!gpsEventTime(time)||Number(value.conditionType)!==1||!Array.isArray(value.triggerConditions)||!value.triggerConditions.length||value.triggerConditions.length>20)throw new Error('GPS_WEBHOOK_BODY');
  const conditions=value.triggerConditions.map(raw=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('GPS_WEBHOOK_BODY');
    const type=Number((raw as Record<string,unknown>).alarmType);
    if(!Number.isSafeInteger(type)||type<1||type>10000)throw new Error('GPS_WEBHOOK_BODY');
    return {alarmType:type};
  });
  return {id,imei,triggerTime:time,triggerConditions:conditions,conditionType:1};
}
