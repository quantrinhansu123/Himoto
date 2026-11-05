import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { uploadMobileRenewalBill, readMobileBillInfo, readMobileBillImage } from "@/lib/server/mobile-bills";
import { mobileFailure, mobileJson, MOBILE_HEADERS } from "@/lib/server/mobile-response";
import { MobileError } from "@/lib/server/mobile-session";
export const runtime = "nodejs";
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; version: string }> }) {
  try {
    const {user}=await requireMobileSession(request),{id,version}=await params;
    return mobileJson(await uploadMobileRenewalBill(user,id,version,request));
  } catch(error) { return mobileFailure(error); }
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; version: string }> }) {
  try {
    const {user}=await requireMobileSession(request),{id,version}=await params,p=request.nextUrl.searchParams;
    if([...p.keys()].some(key=>key!=="revision") || p.getAll("revision").length>1)throw new MobileError("Bộ lọc ảnh bill không hợp lệ.",400,"INVALID_QUERY");
    if(!p.has("revision"))return mobileJson(await readMobileBillInfo(user,id,version));
    const image=await readMobileBillImage(user,id,version,p.get("revision")??"");
    return new NextResponse(image.data,{headers:{...MOBILE_HEADERS,"Content-Type":image.mimeType,"Content-Length":String(image.data.byteLength),"Content-Disposition":"inline; filename=bill.jpg","ETag":`"${image.revision}"`}});
  } catch(error) { return mobileFailure(error); }
}
