import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { withMobileData } from "@/lib/server/mobile-context";
import { mobileFailure,mobileJson,MOBILE_HEADERS } from "@/lib/server/mobile-response";
import { MobileError } from "@/lib/server/mobile-session";
import { hasPermission } from "@/lib/management/permissions";
import { handleShiftMedia } from "@/lib/server/shift-media-handler";
import {isMediaRevision} from '../../../../../../../../../shared/mobile-record-media';
export const runtime="nodejs";
export const maxDuration=300;
async function handle(request:NextRequest,context:{params:Promise<{id:string;mediaId:string}>}){try{const{user}=await requireMobileSession(request);if(!hasPermission(user,"contracts.read"))throw new MobileError("Không có quyền xem báo cáo ca.",403);
  const p=request.nextUrl.searchParams;
  if(request.method==='GET'&&(request.headers.has('idempotency-key')||request.nextUrl.search&&([...p.keys()].some(k=>!['video','revision'].includes(k)||p.getAll(k).length!==1)||p.get('video')!=='1'||!isMediaRevision(p.get('revision')))))throw new MobileError('Phiên bản video chưa hợp lệ.',400,'INVALID_VIDEO');
  const response=await withMobileData(user,"",()=>handleShiftMedia(request,context,true));if(request.method!=="GET"&&response.ok){const body=await response.json();return mobileJson(body.data);}for(const[key,value]of Object.entries(MOBILE_HEADERS))response.headers.set(key,value);return response;}catch(error){return mobileFailure(error);}}
export const GET=handle;
export const PUT=handle;
export const DELETE=handle;
