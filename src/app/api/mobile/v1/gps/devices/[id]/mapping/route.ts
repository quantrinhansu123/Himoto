import {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {readMobileGpsMapping,recordMobileGpsMapping} from '@/lib/server/mobile-gps-mapping';
import {mobileFailure,mobileJson} from '@/lib/server/mobile-response';
export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  try{const {user}=await requireMobileSession(request),{id}=await params;return mobileJson(await readMobileGpsMapping(user,id));}
  catch(error){return mobileFailure(error);}
}
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  try{const {user}=await requireMobileSession(request),{id}=await params;return mobileJson(await recordMobileGpsMapping(user,id,request));}
  catch(error){return mobileFailure(error);}
}
