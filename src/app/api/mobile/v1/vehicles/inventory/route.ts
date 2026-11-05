import type {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {readMobileFleetInventory} from '@/lib/server/mobile-fleet-inventory';
import {mobileFailure,mobileJson} from '@/lib/server/mobile-response';
export const runtime='nodejs';
export async function GET(request:NextRequest){try{const{user}=await requireMobileSession(request);return mobileJson(await readMobileFleetInventory(user,request.nextUrl.searchParams));}catch(error){return mobileFailure(error);}}
