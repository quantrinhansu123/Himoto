import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { mobileJson,mobileFailure } from "@/lib/server/mobile-response";
import { readMobileReminderHistory,sendMobileReminder } from "@/lib/server/mobile-debt-reminders";
export const runtime="nodejs";
export const maxDuration=30;
export async function GET(request:NextRequest) {try{const{user}=await requireMobileSession(request);return mobileJson(await readMobileReminderHistory(user,request.nextUrl.searchParams));}catch(error){return mobileFailure(error);}}
export async function POST(request:NextRequest) {try{const{user}=await requireMobileSession(request);return mobileJson(await sendMobileReminder(user,request));}catch(error){return mobileFailure(error);}}
