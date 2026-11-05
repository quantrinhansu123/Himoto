import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { mobileJson,mobileFailure } from "@/lib/server/mobile-response";
import { readMobileReminderOptions } from "@/lib/server/mobile-debt-reminders";
export const runtime="nodejs";
export async function GET(request:NextRequest) {try{const{user}=await requireMobileSession(request);return mobileJson(await readMobileReminderOptions(user));}catch(error){return mobileFailure(error);}}
