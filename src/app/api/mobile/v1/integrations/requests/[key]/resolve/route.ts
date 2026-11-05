import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { mobileJson,mobileFailure } from '@/lib/server/mobile-response';
import { resolveMobileIntegration } from '@/lib/server/mobile-integrations';
export const runtime='nodejs';
export async function POST(request:NextRequest,context:{params:Promise<{key:string}>}){try{const{user}=await requireMobileSession(request);return mobileJson(await resolveMobileIntegration(user,(await context.params).key,request));}catch(error){return mobileFailure(error);}}
