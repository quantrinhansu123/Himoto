import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { withMobileData } from "@/lib/server/mobile-context";
import { mobileFailure } from "@/lib/server/mobile-response";
import { MobileError } from "@/lib/server/mobile-session";
import { hasPermission } from "@/lib/management/permissions";
import { handleShiftPhoto } from "@/lib/server/shift-photo-handler";
export const runtime="nodejs";
export const maxDuration=300;
async function handle(request:NextRequest,context:{params:Promise<{id:string;slot:string}>}){try{const{user}=await requireMobileSession(request);if(!hasPermission(user,"contracts.read"))throw new MobileError("Kh?ng c? quy?n xem b?o c?o ca.",403);return withMobileData(user,"",()=>handleShiftPhoto(request,context));}catch(error){return mobileFailure(error);}}
export const GET=handle;
