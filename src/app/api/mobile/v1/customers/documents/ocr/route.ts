import type {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {mobileJson,mobileFailure} from '@/lib/server/mobile-response';
import {readMobileCustomerOcr} from '@/lib/server/mobile-customer-ocr';
export const runtime='nodejs';
export const maxDuration=45;
export async function POST(request:NextRequest){
  try{const {user}=await requireMobileSession(request);return mobileJson(await readMobileCustomerOcr(user,request));}
  catch(error){return mobileFailure(error);}
}
