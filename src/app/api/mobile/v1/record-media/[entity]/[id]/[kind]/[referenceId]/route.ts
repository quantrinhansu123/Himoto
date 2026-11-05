import {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {readMobileRecordMedia} from '@/lib/server/mobile-record-media';
import {mobileFailure,mobileJson} from '@/lib/server/mobile-response';
export const runtime='nodejs';
type Params={params:Promise<{entity:string;id:string;kind:string;referenceId:string}>};
export async function GET(request:NextRequest,{params}:Params) {
  try{const {user}=await requireMobileSession(request);return mobileJson(await readMobileRecordMedia(user,await params,request));}
  catch(error){return mobileFailure(error);}
}
