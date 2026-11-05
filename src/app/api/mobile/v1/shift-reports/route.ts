import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { mobileJson,mobileFailure } from "@/lib/server/mobile-response";
import { after } from "next/server";
import { readMobileShifts,saveMobileShift } from "@/lib/server/mobile-shift-reports";
import { deliverReportTelegram } from "@/lib/server/report-telegram";
export const runtime="nodejs";
export const maxDuration=300;
export async function GET(request:NextRequest){try{const{user}=await requireMobileSession(request);return mobileJson(await readMobileShifts(user,request.nextUrl.searchParams));}catch(error){return mobileFailure(error);}}
export async function POST(request:NextRequest){try{const{user}=await requireMobileSession(request);const result=await saveMobileShift(user,request);if(result.deliveryKey)after(()=>deliverReportTelegram(result.deliveryKey!));return mobileJson(result.receipt);}catch(error){return mobileFailure(error);}}
