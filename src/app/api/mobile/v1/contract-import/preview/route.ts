import {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {mobileJson,mobileFailure} from '@/lib/server/mobile-response';
import {previewMobileContractImport} from '@/lib/server/mobile-contract-import';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:NextRequest){try{const {user}=await requireMobileSession(request);return mobileJson(await previewMobileContractImport(user,request));}catch(error){return mobileFailure(error);}}
