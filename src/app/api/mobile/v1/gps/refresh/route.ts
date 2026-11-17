import {after,NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {refreshMobileGps,requestMobileGpsRefresh} from '@/lib/server/mobile-gps-sync';
import {mobileFailure,mobileJson} from '@/lib/server/mobile-response';
export const runtime='nodejs';
export const maxDuration=90;
export async function POST(request:NextRequest) {
  try{
    const {user}=await requireMobileSession(request);
    if(request.headers.get('Prefer')==='respond-async')return mobileJson(await requestMobileGpsRefresh(user,request,after),202);
    const result=await refreshMobileGps(user,request);
    return mobileJson(result);
  }catch(error){return mobileFailure(error);}
}
