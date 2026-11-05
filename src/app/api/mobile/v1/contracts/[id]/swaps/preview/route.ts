import {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {readMobileSwapPreview} from '@/lib/server/mobile-swaps';
import {mobileFailure,mobileJson} from '@/lib/server/mobile-response';
export const runtime='nodejs';
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  try{const {user}=await requireMobileSession(request),{id}=await params;return mobileJson(await readMobileSwapPreview(user,id,request));}
  catch(error){return mobileFailure(error);}
}
