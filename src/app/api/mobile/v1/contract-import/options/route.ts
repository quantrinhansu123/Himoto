import {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {mobileJson,mobileFailure} from '@/lib/server/mobile-response';
import {mobileContractImportOptions} from '@/lib/server/mobile-contract-import';
export const runtime='nodejs';
export async function GET(request:NextRequest){try{const {user}=await requireMobileSession(request);return mobileJson(await mobileContractImportOptions(user));}catch(error){return mobileFailure(error);}}
