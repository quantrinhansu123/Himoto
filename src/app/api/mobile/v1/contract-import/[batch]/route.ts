import {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {mobileJson,mobileFailure} from '@/lib/server/mobile-response';
import {writeMobileContractImport} from '@/lib/server/mobile-contract-import';
export const runtime='nodejs';
export const maxDuration=90;
export async function POST(request:NextRequest,context:{params:Promise<{batch:string}>}){try{const {user}=await requireMobileSession(request);return mobileJson(await writeMobileContractImport(user,(await context.params).batch,request));}catch(error){return mobileFailure(error);}}
