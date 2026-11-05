import { after,NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { mobileJson,mobileFailure } from "@/lib/server/mobile-response";
import { mobileBatteryTelegram } from "@/lib/server/mobile-battery";
import { mobileBody } from "@/lib/server/mobile-writes";
import { MobileError } from "@/lib/server/mobile-session";
import { dispatchContractNotifications } from "@/lib/server/contract-notifications";
export const runtime="nodejs";
export const maxDuration=300;
type Context={params:Promise<{id:string}>};
async function handle(request:NextRequest,context:Context,writing:boolean){try{const{user}=await requireMobileSession(request),{id}=await context.params;let key=request.nextUrl.searchParams.get('request_id')||'';if(writing){const body=await mobileBody(request,1024);if(Object.keys(body).some(k=>k!=='request_id'&&k!=='action')||body.action!=='send'||typeof body.request_id!=='string')throw new MobileError('Chọn thao tác gửi Telegram pin hợp lệ.');key=body.request_id;}const state=await mobileBatteryTelegram(user,id,key,writing);if(writing||['pending','sending'].includes(state.status||''))after(()=>dispatchContractNotifications(undefined,2,undefined,undefined,undefined,undefined,[Number(id)]));return mobileJson(state);}catch(error){return mobileFailure(error);}}
export const GET=(request:NextRequest,context:Context)=>handle(request,context,false);
export const POST=(request:NextRequest,context:Context)=>handle(request,context,true);
