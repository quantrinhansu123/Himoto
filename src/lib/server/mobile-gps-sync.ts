import 'server-only';
import type {NextRequest} from 'next/server';
import type {SessionUser} from './management-session';
import {requireMobileGps} from './mobile-gps';
import {MobileError} from './mobile-session';
import {syncGpsAccounts} from './gps-sync';
import {readGpsSyncState} from './gps-sync-state';
import type {MobileGpsSyncRequest} from '../../../shared/mobile-gps';
async function validateRefresh(user:SessionUser,request:NextRequest) {
  requireMobileGps(user);
  const length=request.headers.get('content-length');
  if(request.headers.has('Idempotency-Key')||request.nextUrl.search||length!==null&&(!/^\d+$/.test(length)||Number(length)>0))
    throw new MobileError('Yêu cầu đồng bộ GPS không hợp lệ.',400,'INVALID_GPS_REFRESH');
  // Next's Node adapter supplies a stream even for a Content-Length: 0 POST.
  // Inspect actual bytes so valid empty native requests are not rejected.
  const reader=request.body?.getReader();
  if(reader)try{
    while(true){const part=await reader.read();if(part.done)break;if(part.value.byteLength){await reader.cancel();throw new MobileError('Yêu cầu đồng bộ GPS không hợp lệ.',400,'INVALID_GPS_REFRESH');}}
  }finally{reader.releaseLock();}
}
export async function refreshMobileGps(user:SessionUser,request:NextRequest) {
  await validateRefresh(user,request);
  const result=await syncGpsAccounts();
  if(result.attempted>0&&result.succeeded===0)throw new MobileError('Chưa đồng bộ được GPS. Trạng thái gần nhất được giữ nguyên.',503,'GPS_SYNC_UNAVAILABLE');
  return{synced:true as const,observedAt:new Date().toISOString()};
}
export async function requestMobileGpsRefresh(user:SessionUser,request:NextRequest,defer:(run:()=>Promise<void>)=>void):Promise<MobileGpsSyncRequest>{
  await validateRefresh(user,request);
  const state=await readGpsSyncState(),requestedAt=new Date().toISOString();
  const status=!state.enabledAccounts?'unconfigured':state.inProgress?'running':
    state.nextAttemptAt&&Date.parse(state.nextAttemptAt)>Date.now()+1000?'not_due':'queued';
  if(status==='queued')defer(async()=>{try{await syncGpsAccounts();}catch{console.error('Requested GPS sync failed; scheduled collector will retry.');}});
  return {status,requestedAt,state};
}
export async function readMobileGpsSyncState(user:SessionUser){requireMobileGps(user);return readGpsSyncState();}
