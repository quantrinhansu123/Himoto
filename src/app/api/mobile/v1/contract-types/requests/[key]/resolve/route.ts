import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { mobileJson,mobileFailure } from '@/lib/server/mobile-response';
import { resolveMobileContractType } from '@/lib/server/mobile-contract-types';
export const runtime='nodejs';
export async function POST(request:NextRequest,context:{params:Promise<{key:string}>}){try{const{user}=await requireMobileSession(request);return mobileJson(await resolveMobileContractType(user,(await context.params).key,request));}catch(error){return mobileFailure(error);}}
