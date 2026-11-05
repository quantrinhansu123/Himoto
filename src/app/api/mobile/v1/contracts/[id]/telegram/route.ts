import {after,NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {readMobileContractTelegram,writeMobileContractTelegram} from '@/lib/server/mobile-telegram';
import {mobileJson,mobileFailure} from '@/lib/server/mobile-response';
import {dispatchContractNotifications} from '@/lib/server/contract-notifications';
import {dispatchTelegramRetractions} from '@/lib/server/telegram-retractions';
export const runtime='nodejs';
export const maxDuration=300;
type Context={params:Promise<{id:string}>};
export async function GET(request:NextRequest,context:Context){try{const{user}=await requireMobileSession(request);return mobileJson(await readMobileContractTelegram(user,(await context.params).id));}catch(error){return mobileFailure(error);}}
export async function POST(request:NextRequest,context:Context){try{const{user}=await requireMobileSession(request),{id}=await context.params,value=await writeMobileContractTelegram(user,id,request);after(async()=>{if(value.action==='retract')await dispatchTelegramRetractions(undefined,1,undefined,[Number(id)]);else await dispatchContractNotifications(undefined,1,undefined,[Number(id)]);});return mobileJson(value);}catch(error){return mobileFailure(error);}}
