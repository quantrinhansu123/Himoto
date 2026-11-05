import {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {readMobileVehicleTransferPreparation} from '@/lib/server/mobile-vehicle-transfers';
import {recordMobileVehicleTransfer} from '@/lib/server/mobile-vehicle-transfer-write';
import {mobileFailure,mobileJson} from '@/lib/server/mobile-response';
export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  try{const {user}=await requireMobileSession(request),{id}=await params;return mobileJson(await readMobileVehicleTransferPreparation(user,id,request));}
  catch(error){return mobileFailure(error);}
}
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  try{const {user}=await requireMobileSession(request),{id}=await params;return mobileJson(await recordMobileVehicleTransfer(user,id,request));}
  catch(error){return mobileFailure(error);}
}
