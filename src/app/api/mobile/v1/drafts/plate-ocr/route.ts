import {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {readMobilePlateOcr} from '@/lib/server/mobile-plate-ocr';
import {mobileJson,mobileFailure} from '@/lib/server/mobile-response';
export const runtime='nodejs';
export const maxDuration=45;
export async function POST(request:NextRequest) {
  try{const {user}=await requireMobileSession(request);return mobileJson(await readMobilePlateOcr(user,request));}catch(error){return mobileFailure(error);}
}
