import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { mobileJson,mobileFailure } from "@/lib/server/mobile-response";
import { readMobileBatteryPrefill } from "@/lib/server/mobile-battery";
export const runtime="nodejs";
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){try{const{user}=await requireMobileSession(request);return mobileJson(await readMobileBatteryPrefill(user,(await context.params).id));}catch(error){return mobileFailure(error);}}
