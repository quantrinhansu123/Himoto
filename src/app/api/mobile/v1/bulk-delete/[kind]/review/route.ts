import type {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {reviewMobileBulkDelete} from '@/lib/server/mobile-bulk-delete';
import {mobileJson,mobileFailure} from '@/lib/server/mobile-response';
export const runtime='nodejs';
export async function POST(request:NextRequest,{params}:{params:Promise<{kind:string}>}){try{const{user}=await requireMobileSession(request);return mobileJson(await reviewMobileBulkDelete(user,(await params).kind,request));}catch(error){return mobileFailure(error);}}
