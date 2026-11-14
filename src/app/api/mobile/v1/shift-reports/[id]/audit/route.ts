import {deliverReportTelegram} from '@/lib/server/report-telegram';
import { after,NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { mobileJson,mobileFailure } from "@/lib/server/mobile-response";
import { readMobileShiftSnapshot,saveMobileShiftAudit } from "@/lib/server/mobile-shift-reports";
export const runtime="nodejs";
export const maxDuration=300;
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){try{const{user}=await requireMobileSession(request);return mobileJson(await readMobileShiftSnapshot(user,(await context.params).id));}catch(error){return mobileFailure(error);}}
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){try{const{user}=await requireMobileSession(request);const id=(await context.params).id,result=await saveMobileShiftAudit(user,id,request);after(()=>deliverReportTelegram(`shift-audit:${id}`));return mobileJson(result);}catch(error){return mobileFailure(error);}}
