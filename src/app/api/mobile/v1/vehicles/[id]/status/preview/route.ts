import {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {previewMobileVehicleStatus} from '@/lib/server/mobile-vehicle-status';
import {mobileFailure,mobileJson} from '@/lib/server/mobile-response';
export const runtime='nodejs';
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  try{const {user}=await requireMobileSession(request),{id}=await params;return mobileJson(await previewMobileVehicleStatus(user,id,request));}
  catch(error){return mobileFailure(error);}
}
