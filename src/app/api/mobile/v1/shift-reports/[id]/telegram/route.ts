import { after,NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { mobileJson,mobileFailure } from "@/lib/server/mobile-response";
import { readMobileShiftTelegram,retryMobileShiftTelegram } from "@/lib/server/mobile-shift-reports";
import { deliverReportTelegram } from "@/lib/server/report-telegram";
import {shiftTelegramKey} from '@/lib/server/shift-telegram-domain';
export const runtime="nodejs";
export const maxDuration=300;
type Context={params:Promise<{id:string}>};
export async function GET(request:NextRequest,context:Context){try{const{user}=await requireMobileSession(request),id=(await context.params).id,stage=request.nextUrl.searchParams.get('stage')||'pgd',key=shiftTelegramKey(id,stage);const result=await readMobileShiftTelegram(user,id,stage);if(result?.status==='pending')after(()=>deliverReportTelegram(key));return mobileJson(result);}catch(error){return mobileFailure(error);}}
export async function POST(request:NextRequest,context:Context){try{const{user}=await requireMobileSession(request);const result=await retryMobileShiftTelegram(user,(await context.params).id,request.nextUrl.searchParams.get('stage')||'pgd');if(result.deliveryKey)after(()=>deliverReportTelegram(result.deliveryKey!));return mobileJson({status:result.status});}catch(error){return mobileFailure(error);}}
