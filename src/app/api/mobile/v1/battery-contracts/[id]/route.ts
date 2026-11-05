import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { mobileJson,mobileFailure } from "@/lib/server/mobile-response";
import { readMobileBattery,saveMobileBattery,deleteMobileBattery } from "@/lib/server/mobile-battery";
export const runtime="nodejs";
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){try{const{user}=await requireMobileSession(request);return mobileJson(await readMobileBattery(user,(await context.params).id));}catch(error){return mobileFailure(error);}}
export async function PATCH(request:NextRequest,context:{params:Promise<{id:string}>}){try{const{user}=await requireMobileSession(request);return mobileJson(await saveMobileBattery(user,(await context.params).id,request));}catch(error){return mobileFailure(error);}}
export async function DELETE(request:NextRequest,context:{params:Promise<{id:string}>}){try{const{user}=await requireMobileSession(request);return mobileJson(await deleteMobileBattery(user,(await context.params).id,request));}catch(error){return mobileFailure(error);}}
