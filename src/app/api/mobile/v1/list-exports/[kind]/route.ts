import {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {exportMobileList} from '@/lib/server/mobile-list-export';
import {mobileJson,mobileFailure} from '@/lib/server/mobile-response';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:NextRequest,{params}:{params:Promise<{kind:string}>}) {
  try{const {user}=await requireMobileSession(request);return mobileJson(await exportMobileList(user,(await params).kind,request));}
  catch(error){return mobileFailure(error);}
}
