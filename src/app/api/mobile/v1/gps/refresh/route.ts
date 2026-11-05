import {after,NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {refreshMobileGps} from '@/lib/server/mobile-gps-sync';
import {syncGpsEventHistory} from '@/lib/server/gps-history-sync';
import {mobileFailure,mobileJson} from '@/lib/server/mobile-response';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:NextRequest) {
  try{
    const {user}=await requireMobileSession(request),result=await refreshMobileGps(user,request);
    after(async()=>{try{await syncGpsEventHistory();}catch{console.error('Mobile GPS history sync unavailable');}});
    return mobileJson(result);
  }catch(error){return mobileFailure(error);}
}
