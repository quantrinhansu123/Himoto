import { after,type NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { mobileJson,mobileFailure } from "@/lib/server/mobile-response";
import { mobileBody } from "@/lib/server/mobile-writes";
import { mobileShiftId,queueMobileShiftReopen,readMobileShiftReopen } from "@/lib/server/mobile-shift-reports";
import { runShiftReopen } from "@/lib/server/shift-report-reopen";

export const runtime="nodejs";
export const maxDuration=120;
type Context={params:Promise<{id:string}>};

export async function GET(request:NextRequest,{params}:Context){
  try{
    const {user}=await requireMobileSession(request);
    return mobileJson(await readMobileShiftReopen(user,(await params).id));
  }catch(error){return mobileFailure(error);}
}

export async function POST(request:NextRequest,{params}:Context){
  try{
    const {user}=await requireMobileSession(request);
    const {id}=await params;
    const reportId=mobileShiftId(id);
    const key=await queueMobileShiftReopen(user,reportId,await mobileBody(request,4096));
    if(key)after(()=>runShiftReopen(reportId,key));
    return mobileJson(await readMobileShiftReopen(user,id));
  }catch(error){return mobileFailure(error);}
}
