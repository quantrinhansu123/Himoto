import {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {prepareMobileShiftVideo} from '@/lib/server/mobile-shift-video';
import {mobileFailure,mobileJson} from '@/lib/server/mobile-response';
export const runtime='nodejs';
export const maxDuration=180;
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  try{const{user}=await requireMobileSession(request),{id}=await params;return mobileJson(await prepareMobileShiftVideo(user,id,request));}catch(error){return mobileFailure(error);}
}
