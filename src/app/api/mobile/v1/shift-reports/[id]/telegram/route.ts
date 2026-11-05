import { after,NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { mobileJson,mobileFailure } from "@/lib/server/mobile-response";
import { readMobileShiftTelegram,retryMobileShiftTelegram } from "@/lib/server/mobile-shift-reports";
import { deliverReportTelegram } from "@/lib/server/report-telegram";
export const runtime="nodejs";
export const maxDuration=60;
type Context={params:Promise<{id:string}>};
export async function GET(request:NextRequest,context:Context){try{const{user}=await requireMobileSession(request);return mobileJson(await readMobileShiftTelegram(user,(await context.params).id));}catch(error){return mobileFailure(error);}}
export async function POST(request:NextRequest,context:Context){try{const{user}=await requireMobileSession(request);const result=await retryMobileShiftTelegram(user,(await context.params).id);if(result.deliveryKey)after(()=>deliverReportTelegram(result.deliveryKey!));return mobileJson({status:result.status});}catch(error){return mobileFailure(error);}}
