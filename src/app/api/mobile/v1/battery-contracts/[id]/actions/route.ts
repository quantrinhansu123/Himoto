import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { mobileJson,mobileFailure } from "@/lib/server/mobile-response";
import { readMobileBattery,actionMobileBattery } from "@/lib/server/mobile-battery";
export const runtime="nodejs";
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){try{const{user}=await requireMobileSession(request);return mobileJson(await readMobileBattery(user,(await context.params).id));}catch(error){return mobileFailure(error);}}
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){try{const{user}=await requireMobileSession(request);return mobileJson(await actionMobileBattery(user,(await context.params).id,request));}catch(error){return mobileFailure(error);}}
