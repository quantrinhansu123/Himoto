import type {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {exportMobileDashboard} from '@/lib/server/mobile-dashboard';
import {mobileFailure} from '@/lib/server/mobile-response';
import {mobileExportResponse} from '@/lib/server/mobile-export-response';
export const runtime='nodejs';
export async function GET(request:NextRequest){try{const{user}=await requireMobileSession(request);return mobileExportResponse(await exportMobileDashboard(user,request.nextUrl.searchParams),request);}catch(error){return mobileFailure(error);}}
