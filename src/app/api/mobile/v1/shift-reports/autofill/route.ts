import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { mobileJson,mobileFailure } from "@/lib/server/mobile-response";
import { readMobileShiftAutofill } from "@/lib/server/mobile-shift-reports";
export const runtime="nodejs";
export async function GET(request:NextRequest){try{const{user}=await requireMobileSession(request);return mobileJson(await readMobileShiftAutofill(user,request.nextUrl.searchParams));}catch(error){return mobileFailure(error);}}
