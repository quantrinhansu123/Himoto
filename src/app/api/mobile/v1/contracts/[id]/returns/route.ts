import {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {readMobileReturnPreparation} from '@/lib/server/mobile-returns';
import {recordMobileReturn} from '@/lib/server/mobile-return-write';
import {mobileFailure,mobileJson} from '@/lib/server/mobile-response';
export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  try{const {user}=await requireMobileSession(request),{id}=await params;return mobileJson(await readMobileReturnPreparation(user,id,request));}
  catch(error){return mobileFailure(error);}
}
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  try{const {user}=await requireMobileSession(request),{id}=await params;return mobileJson(await recordMobileReturn(user,id,request));}
  catch(error){return mobileFailure(error);}
}
