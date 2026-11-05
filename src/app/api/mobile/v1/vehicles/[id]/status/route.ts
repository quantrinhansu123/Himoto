import {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {readMobileVehicleStatusPreparation,recordMobileVehicleStatus} from '@/lib/server/mobile-vehicle-status';
import {mobileFailure,mobileJson} from '@/lib/server/mobile-response';
export const runtime='nodejs';
type Params={params:Promise<{id:string}>};
export async function GET(request:NextRequest,{params}:Params) {
  try{const {user}=await requireMobileSession(request),{id}=await params;return mobileJson(await readMobileVehicleStatusPreparation(user,id,request));}
  catch(error){return mobileFailure(error);}
}
export async function POST(request:NextRequest,{params}:Params) {
  try{const {user}=await requireMobileSession(request),{id}=await params;return mobileJson(await recordMobileVehicleStatus(user,id,request));}
  catch(error){return mobileFailure(error);}
}
