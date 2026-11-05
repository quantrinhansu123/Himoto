import type {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {readMobileStaffOrganization} from '@/lib/server/mobile-staff-organization';
import {mobileJson,mobileFailure} from '@/lib/server/mobile-response';
export const runtime='nodejs';
export async function GET(request:NextRequest){try{const{user}=await requireMobileSession(request);return mobileJson(await readMobileStaffOrganization(user,request.nextUrl.searchParams));}catch(error){return mobileFailure(error);}}
