import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { mobileJson,mobileFailure } from "@/lib/server/mobile-response";
import { mobileShiftPhotoView,readMobileShift } from "@/lib/server/mobile-shift-reports";
export const runtime="nodejs";
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){try{const{user}=await requireMobileSession(request);const result=await readMobileShift(user,(await context.params).id);return mobileJson(mobileShiftPhotoView(result,request.headers));}catch(error){return mobileFailure(error);}}
