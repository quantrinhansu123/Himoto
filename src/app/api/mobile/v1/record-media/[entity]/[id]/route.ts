import {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {readMobileMediaTargets} from '@/lib/server/mobile-record-media';
import {mobileFailure,mobileJson} from '@/lib/server/mobile-response';
export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{entity:string;id:string}>}) {
  try{const {user}=await requireMobileSession(request);return mobileJson(await readMobileMediaTargets(user,await params,request));}
  catch(error){return mobileFailure(error);}
}
