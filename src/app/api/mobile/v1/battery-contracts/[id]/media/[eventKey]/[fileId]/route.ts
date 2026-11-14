import type {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {mobileJson,mobileFailure} from '@/lib/server/mobile-response';
import {batteryMedia} from '@/lib/server/battery-media';
export const runtime='nodejs';
async function handle(request:NextRequest,{params}:{params:Promise<{id:string;eventKey:string;fileId:string}>}){try{const{user}=await requireMobileSession(request);const result=await batteryMedia(user,await params,request);return result instanceof Response?result:mobileJson(result);}catch(error){return mobileFailure(error);}}
export const GET=handle;export const PUT=handle;export const DELETE=handle;
