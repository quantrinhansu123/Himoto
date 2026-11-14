import type {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {mobileJson,mobileFailure} from '@/lib/server/mobile-response';
import {batteryMedia} from '@/lib/server/battery-media';
export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string;eventKey:string}>}){try{const{user}=await requireMobileSession(request);return mobileJson(await batteryMedia(user,await params,request));}catch(error){return mobileFailure(error);}}
