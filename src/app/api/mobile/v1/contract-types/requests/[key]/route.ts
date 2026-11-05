import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { mobileJson,mobileFailure } from '@/lib/server/mobile-response';
import { readMobileContractTypeResult } from '@/lib/server/mobile-contract-types';
export const runtime='nodejs';
export async function GET(request:NextRequest,context:{params:Promise<{key:string}>}){try{const{user}=await requireMobileSession(request);return mobileJson(await readMobileContractTypeResult(user,(await context.params).key));}catch(error){return mobileFailure(error);}}
