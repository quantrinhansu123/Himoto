import {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {readMobileMediaHistoryTargets} from '@/lib/server/mobile-record-media';
import {mobileFailure,mobileJson} from '@/lib/server/mobile-response';
export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  try{const{user}=await requireMobileSession(request),{id}=await params;return mobileJson(await readMobileMediaHistoryTargets(user,id,request));}catch(error){return mobileFailure(error);}
}
