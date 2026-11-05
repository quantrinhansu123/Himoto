import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { mobileJson,mobileFailure } from "@/lib/server/mobile-response";
import { readMobileBatteryPage,saveMobileBattery } from "@/lib/server/mobile-battery";
export const runtime="nodejs";
export async function GET(request:NextRequest){try{const{user}=await requireMobileSession(request);return mobileJson(await readMobileBatteryPage(user,request.nextUrl.searchParams));}catch(error){return mobileFailure(error);}}
export async function POST(request:NextRequest){try{const{user}=await requireMobileSession(request);return mobileJson(await saveMobileBattery(user,null,request));}catch(error){return mobileFailure(error);}}
