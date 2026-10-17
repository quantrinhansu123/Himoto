import 'server-only';
import { createHash,randomBytes } from 'node:crypto';
import type { GpsObservation,GpsProvider,GpsState } from '@/lib/management/gps';

type Json=Record<string,unknown>;
export interface GpsSession {token:string;accountId:string}
export class GpsProviderError extends Error {constructor(public code:string){super(`Không đọc được dữ liệu GPS (${code}).`);}}
export function shouldRefreshGpsSession(error:unknown) {
  return error instanceof GpsProviderError&&/^(HTTP_401|INVALID_RESPONSE|PROTRACK_READ_(10002|10003|10010|10011|10012|INVALID)|IOPGPS_READ_INVALID)$/.test(error.code);
}
const agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36';
const md5=(value:string)=>createHash('md5').update(value).digest('hex');
const iso=(value:unknown)=>{const n=Number(value);if(!Number.isFinite(n)||n<=0)return null;const date=new Date(n<1e12?n*1000:n);return Number.isFinite(date.getTime())?date.toISOString():null;};
const number=(value:unknown)=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
const coordinate=(value:unknown,max:number)=>{const n=number(value);return n!==null&&Math.abs(n)<=max?n:null;};
async function request(url:URL,options:RequestInit={},send:typeof fetch=fetch) {
  const response=await send(url,{...options,headers:{'User-Agent':agent,...options.headers},redirect:'error',signal:AbortSignal.timeout(20000),cache:'no-store'});
  if(!response.ok)throw new GpsProviderError(`HTTP_${response.status}`);
  const text=await response.text();if(text.length>8*1024*1024)throw new GpsProviderError('RESPONSE_TOO_LARGE');
  let body:Json;try{body=JSON.parse(text);}catch{throw new GpsProviderError('INVALID_RESPONSE');}
  return {body,response};
}
export async function loginGps(provider:GpsProvider,username:string,password:string,send:typeof fetch=fetch):Promise<GpsSession> {
  if(provider==='protrack') {
    const origin='https://www.protrack365.com';
    const initial=await send(origin+'/',{headers:{'User-Agent':agent},redirect:'error',signal:AbortSignal.timeout(20000),cache:'no-store'});
    const cookie=initial.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');await initial.body?.cancel();
    const url=new URL('/LoginService',origin);url.search=new URLSearchParams({method:'login',username,passwd:md5(password),logintype:'webcustomer',tzOffset:'25200',_t:String(Date.now())}).toString();
    const {body,response}=await request(url,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json',Origin:origin,Referer:origin+'/'}},send);
    const token=response.headers.getSetCookie().find(value=>value.startsWith('token='))?.split(';')[0].slice(6);
    if(body.errorcode!==0||!token||!body.customerid)throw new GpsProviderError(`PROTRACK_LOGIN_${body.errorcode??'INVALID'}`);
    return {token:decodeURIComponent(token),accountId:String(body.customerid)};
  }
  const {body,response}=await request(new URL('https://iopgps.com/login'),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username,password:md5(password)+md5(randomBytes(8).toString('hex')),loginType:'ADMIN',rememberMe:'false',domain:'iopgps.com'}).toString()},send);
  const token=response.headers.getSetCookie().find(value=>value.startsWith('USER_TOKEN='))?.split(';')[0].slice(11);
  if((body.resultBean as Json)?.code!==0||!token||!body.accountId)throw new GpsProviderError(`IOPGPS_LOGIN_${(body.resultBean as Json)?.code??'INVALID'}`);
  return {token,accountId:String(body.accountId)};
}
export function normalizeProtrackDevice(raw:Json,serverTime=Date.now()):GpsObservation {
  const heartbeat=iso(raw.hearttime),speed=number(raw.speed);
  const connected=heartbeat!==null&&serverTime-Date.parse(heartbeat)<=5*60_000;
  const state:GpsState=raw.block===true||raw.validate===false?'warning':!connected?'offline':speed===null?'warning':speed>0?'online':'stopped';
  return {external_id:String(raw.imei||raw.deviceid||''),name:String(raw.devicename||''),license:String(raw.carnumber||''),state,
    provider_status:raw.block===true?'blocked':raw.validate===false?'invalid':!heartbeat?'never_online':connected?'connected':'offline',
    latitude:coordinate(raw.lat,90),longitude:coordinate(raw.lng,180),speed,ignition:Number(raw.accstatus)===-1?null:Number(raw.accstatus)===1,
    recorded_at:iso(raw.gpstime),heartbeat_at:heartbeat};
}
export function normalizeIopDevice(raw:Json):GpsObservation {
  const data=(raw.deviceStatusBean||{}) as Json,status=number(data.status),speed=number(data.speed);
  const state:GpsState=status===0?'offline':status===1?(speed===null?'warning':speed>0?'online':'stopped'):'warning';
  return {external_id:String(raw.imei||''),name:String(raw.name||''),license:String(raw.licenseNumber||raw.plateNumber||''),state,
    provider_status:status===null?'no_location':String(status),latitude:coordinate(data.lat,90),longitude:coordinate(data.lng,180),speed,
    ignition:typeof data.accStatus==='boolean'?data.accStatus:null,recorded_at:iso(data.gpsTime),heartbeat_at:iso(data.heartTime)};
}
export async function readGpsDevices(provider:GpsProvider,session:GpsSession,send:typeof fetch=fetch):Promise<GpsObservation[]> {
  if(provider==='protrack') {
    // This is the read endpoint used by the provider's own monitoring page.
    const url=new URL('https://real.gpscenter.xyz/LocationService');
    url.search=new URLSearchParams({method:'customerDeviceAndGpsone',customerid:session.accountId,maptype:'google',token:session.token,version:'2',_t:String(Date.now()),lang:'en-us',fromweb:'1',timezone:'25200',uuid:''}).toString();
    const {body}=await request(url,{headers:{Origin:'https://www.protrack365.com',Referer:'https://www.protrack365.com/'}},send);
    if(body.errorcode!==0||!Array.isArray(body.records))throw new GpsProviderError(`PROTRACK_READ_${body.errorcode??'INVALID'}`);
    if(body.excessflag===true||Number(body.excessflag)>0)throw new GpsProviderError('PROTRACK_LIMIT');
    return (body.records as Json[]).map(row=>normalizeProtrackDevice(row,Number(body.servertime)||Date.now()));
  }
  const result:GpsObservation[]=[];
  for(let page=1;page<=100;page++) {
    const url=new URL('https://iopgps.com/rest/device/list');url.search=new URLSearchParams({accountId:session.accountId,needCount:'true',pageSize:'100',currentPage:String(page),status:'-1',lang:'en',source:'25',zoneId:'Asia/Ho_Chi_Minh',v:String(Date.now())}).toString();
    const {body}=await request(url,{headers:{Cookie:`USER_TOKEN=${session.token}`}},send);
    if(!Array.isArray(body.data)||!body.page)throw new GpsProviderError(`IOPGPS_READ_${(body.resultBean as Json)?.code??'INVALID'}`);
    const data=body.data as Json[];result.push(...data.map(normalizeIopDevice));
    const count=Number((body.page as Json).count);
    if(!Number.isSafeInteger(count)||count<0)throw new GpsProviderError('IOPGPS_PAGE');
    if(result.length>=count)return result;
    if(!data.length)throw new GpsProviderError('IOPGPS_INCOMPLETE');
  }
  throw new GpsProviderError('IOPGPS_LIMIT');
}
