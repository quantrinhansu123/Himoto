import {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {testMobilePush} from '@/lib/server/mobile-push';
import {mobileJson,mobileFailure} from '@/lib/server/mobile-response';
export const runtime='nodejs';
export async function POST(request:NextRequest){
  try{const {user,sessionId}=await requireMobileSession(request);return mobileJson(await testMobilePush(request,user.id,sessionId));}
  catch(error){return mobileFailure(error);}
}
