import type {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {readMobileBatteryStaff} from '@/lib/server/mobile-battery';
import {mobileJson,mobileFailure} from '@/lib/server/mobile-response';
export const runtime='nodejs';
export async function GET(request:NextRequest){try{const{user}=await requireMobileSession(request);if(request.nextUrl.searchParams.size)return mobileJson({message:'Danh sách nhân viên không nhận bộ lọc.'},400);return mobileJson(await readMobileBatteryStaff(user));}catch(error){return mobileFailure(error);}}
