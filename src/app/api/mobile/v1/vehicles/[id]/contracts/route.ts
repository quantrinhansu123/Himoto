import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { readMobileVehicleContracts } from '@/lib/server/mobile-vehicles';
import { mobileFailure, mobileJson } from '@/lib/server/mobile-response';
export const runtime='nodejs';
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}) {
  try{const {user}=await requireMobileSession(request);return mobileJson(await readMobileVehicleContracts(user,(await context.params).id,request.nextUrl.searchParams));}
  catch(error){return mobileFailure(error);}
}
