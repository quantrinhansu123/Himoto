import {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {readMobileActivity} from '@/lib/server/mobile-activity';
import {mobileFailure,mobileJson} from '@/lib/server/mobile-response';
export const runtime='nodejs';
export async function GET(request:NextRequest){
  try {const {user}=await requireMobileSession(request);return mobileJson(await readMobileActivity(user,request.nextUrl.searchParams));}
  catch(error){return mobileFailure(error);}
}
