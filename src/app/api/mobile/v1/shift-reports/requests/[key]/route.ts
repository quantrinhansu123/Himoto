import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { mobileJson,mobileFailure } from "@/lib/server/mobile-response";
import { readMobileShiftResult } from "@/lib/server/mobile-shift-reports";
export const runtime="nodejs";
export async function GET(request:NextRequest,context:{params:Promise<{key:string}>}){try{const{user}=await requireMobileSession(request);return mobileJson(await readMobileShiftResult(user,(await context.params).key));}catch(error){return mobileFailure(error);}}
