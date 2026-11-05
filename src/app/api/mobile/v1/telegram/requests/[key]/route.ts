import {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {readMobileTelegramResult} from '@/lib/server/mobile-telegram';
import {mobileJson,mobileFailure} from '@/lib/server/mobile-response';
export const runtime='nodejs';
export async function GET(request:NextRequest,context:{params:Promise<{key:string}>}){try{const{user}=await requireMobileSession(request);return mobileJson(await readMobileTelegramResult(user,(await context.params).key));}catch(error){return mobileFailure(error);}}
