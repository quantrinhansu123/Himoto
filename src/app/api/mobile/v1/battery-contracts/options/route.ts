import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { mobileJson,mobileFailure } from "@/lib/server/mobile-response";
import { readMobileBatteryOptions } from "@/lib/server/mobile-battery";
export const runtime="nodejs";
export async function GET(request:NextRequest){try{const{user}=await requireMobileSession(request);return mobileJson(await readMobileBatteryOptions(user));}catch(error){return mobileFailure(error);}}
