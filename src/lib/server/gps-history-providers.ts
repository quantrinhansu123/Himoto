import 'server-only';
import { GpsProviderError,type GpsSession } from './gps-providers';
import type { GpsProvider } from '@/lib/management/gps';
import { gpsAlarmEvent,gpsEventTime,type GpsHistoryPoint,type GpsProviderEvent } from './gps-event-records';

type Json=Record<string,unknown>;
export interface HistoryDevice {external_device_id:string;provider_device_id:string|null}
const maxRows=1000,maxPages=10;
async function read(url:URL,provider:GpsProvider,session:GpsSession,send:typeof fetch) {
  const response=await send(url,{headers:provider==='iopgps'?{Cookie:`USER_TOKEN=${session.token}`}:{Cookie:`token=${encodeURIComponent(session.token)}`,Origin:'https://www.protrack365.com',Referer:'https://www.protrack365.com/'},signal:AbortSignal.timeout(8000),redirect:'error',cache:'no-store'});
  if(!response.ok)throw new GpsProviderError(`HISTORY_HTTP_${response.status}`);
  const text=await response.text();if(text.length>8*1024*1024)throw new GpsProviderError('HISTORY_RESPONSE_LIMIT');
  let body:Json;try{body=JSON.parse(text);}catch{throw new GpsProviderError('HISTORY_INVALID_RESPONSE');}
  const code=provider==='protrack'?body.errorcode:(body.resultBean as Json|undefined)?.code??body.code;
  if(code!==0)throw new GpsProviderError(`HISTORY_${provider.toUpperCase()}_${Number(code)||'INVALID'}`);
  return body;
}
function protrackUrl(session:GpsSession,device:HistoryDevice,start:number,end:number,method:string) {
  if(!device.provider_device_id||!/^\d{1,20}$/.test(device.provider_device_id))throw new GpsProviderError('HISTORY_DEVICE_ID_MISSING');
  const url=new URL('https://real.gpscenter.xyz/LocationService');
  url.search=new URLSearchParams({method,deviceid:device.provider_device_id,begintime:String(start),endtime:String(end),token:session.token,version:'2',fromweb:'1',maptype:'google',count:String(maxRows),lang:'en-us',timezone:'25200',_t:String(Date.now())}).toString();
  return url;
}
export async function readGpsMotionHistory(provider:GpsProvider,session:GpsSession,device:HistoryDevice,start:number,end:number,send:typeof fetch=fetch):Promise<GpsHistoryPoint[]> {
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>3_600_000)throw new GpsProviderError('HISTORY_WINDOW');
  const points:GpsHistoryPoint[]=[];
  if(provider==='iopgps') {
    const url=new URL(`/rest/device/track/${encodeURIComponent(device.external_device_id)}/v3`,'https://iopgps.com');
    url.search=new URLSearchParams({startTime:String(Math.floor(start/1000)),endTime:String(Math.floor(end/1000)),locationType:'1',mapType:'0',filterNoise:'0',filterStillPoints:'0',needStay:'0',stayThreshold:'60',zoneId:'Asia/Ho_Chi_Minh',lang:'en'}).toString();
    const body=await read(url,provider,session,send);
    if(!Array.isArray(body.histories)||body.histories.length>=10000)throw new GpsProviderError('HISTORY_INCOMPLETE');
    for(const raw of body.histories as Json[]) {
      const at=gpsEventTime(raw['7']),speed=Number(raw['12']);
      if(!at||raw['12']==null||!Number.isFinite(speed)||speed<0)throw new GpsProviderError('HISTORY_POINT_INVALID');
      if(Date.parse(at)>=start&&Date.parse(at)<=end)points.push({at,speed});
    }
    return points;
  }
  let cursor=start;
  for(let page=0;page<maxPages;page++) {
    const body=await read(protrackUrl(session,device,cursor,end,'playback'),provider,session,send);
    if(typeof body.record!=='string')throw new GpsProviderError('HISTORY_INCOMPLETE');
    const rows=body.record.split(';').filter(Boolean);let last=cursor;
    for(const raw of rows) {
      const values=raw.split(','),at=gpsEventTime(values[2]),speed=Number(values[3]);
      if(!at||!values[3]||!Number.isFinite(speed)||speed<0)throw new GpsProviderError('HISTORY_POINT_INVALID');
      last=Math.max(last,Date.parse(at));
      if(Date.parse(at)>=start&&Date.parse(at)<=end)points.push({at,speed});
    }
    if(rows.length<maxRows)return points;
    if(last<=cursor)throw new GpsProviderError('HISTORY_PAGINATION_STALLED');
    cursor=last;
  }
  throw new GpsProviderError('HISTORY_INCOMPLETE');
}
export async function readGpsAlarmHistory(provider:GpsProvider,session:GpsSession,device:HistoryDevice,start:number,end:number,send:typeof fetch=fetch):Promise<GpsProviderEvent[]> {
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>3_600_000)throw new GpsProviderError('HISTORY_WINDOW');
  if(provider==='protrack') {
    if(!device.provider_device_id||!/^\d{1,20}$/.test(device.provider_device_id))throw new GpsProviderError('HISTORY_DEVICE_ID_MISSING');
    const url=new URL('https://www.protrack365.com/StatService');
    url.search=new URLSearchParams({method:'deviceAlarmDetail',deviceid:device.provider_device_id,begintime:String(start),endtime:String(end),maptype:'google',count:'1000',token:session.token,_t:String(Date.now())}).toString();
    const wrapped:typeof fetch=(target,init)=>send(target,{...init,headers:{...init?.headers,version:'2',lang:'en-us',fromweb:'1',timezone:'25200'}});
    const body=await read(url,provider,session,wrapped);
    if(!Array.isArray(body.records)||body.records.length>=1000)throw new GpsProviderError('HISTORY_INCOMPLETE');
    return (body.records as Json[]).flatMap(raw=>{
      const event=gpsAlarmEvent(provider,raw.alarm_type,raw.alarm_time??raw.receive_time??raw.gps_time,raw.id??raw.alarm_id);
      return event&&Date.parse(event.at)>=start&&Date.parse(event.at)<=end?[event]:[];
    });
  }
  const url=new URL('https://iopgps.com/rest/device/alarm/single');
  url.search=new URLSearchParams({imei:device.external_device_id,startTime:String(Math.floor(start/1000)),endTime:String(Math.floor(end/1000)),mapType:'0',zoneId:'Asia/Ho_Chi_Minh'}).toString();
  const body=await read(url,provider,session,send);
  if(!Array.isArray(body.beanList)||body.beanList.length>=1000)throw new GpsProviderError('HISTORY_INCOMPLETE');
  return (body.beanList as Json[]).flatMap(raw=>{
    const event=gpsAlarmEvent(provider,raw.alarmTypeId,raw.alarmTime??raw.gpsTime,raw.deviceAlarmId);
    return event&&Date.parse(event.at)>=start&&Date.parse(event.at)<=end?[event]:[];
  });
}
