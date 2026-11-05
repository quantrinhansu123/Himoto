import {after,NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {readMobileTransferTelegram,writeMobileTransferTelegram} from '@/lib/server/mobile-telegram';
import {mobileJson,mobileFailure} from '@/lib/server/mobile-response';
import {dispatchContractNotifications} from '@/lib/server/contract-notifications';
export const runtime='nodejs';
export const maxDuration=300;
type Context={params:Promise<{id:string;eventId:string}>};
export async function GET(request:NextRequest,context:Context){try{const{user}=await requireMobileSession(request),p=await context.params;return mobileJson(await readMobileTransferTelegram(user,p.id,p.eventId));}catch(error){return mobileFailure(error);}}
export async function POST(request:NextRequest,context:Context){try{const{user}=await requireMobileSession(request),p=await context.params,value=await writeMobileTransferTelegram(user,p.id,p.eventId,request);after(async()=>{await dispatchContractNotifications(undefined,2,undefined,undefined,[Number(p.eventId)]);});return mobileJson(value);}catch(error){return mobileFailure(error);}}
