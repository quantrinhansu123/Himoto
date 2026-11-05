import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession, MobileError } from "@/lib/server/mobile-session";
import { uploadMobileRenewalBill, readMobileBillInfo, readMobileBillImage } from "@/lib/server/mobile-bills";
import { mobileFailure, mobileJson, MOBILE_HEADERS } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
type Params = { params: Promise<{ id: string; version: string }> };
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { user } = await requireMobileSession(request), { id, version } = await params;
    return mobileJson(await uploadMobileRenewalBill(user, id, version, request, "collection"));
  } catch (error) { return mobileFailure(error); }
}
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { user } = await requireMobileSession(request), { id, version } = await params, query = request.nextUrl.searchParams;
    if ([...query.keys()].some(key => key !== "revision") || query.getAll("revision").length > 1)
      throw new MobileError("Bộ lọc ảnh bill không hợp lệ.", 400, "INVALID_QUERY");
    if (!query.has("revision")) return mobileJson(await readMobileBillInfo(user, id, version, "collection"));
    const image = await readMobileBillImage(user, id, version, query.get("revision") ?? "", "collection");
    return new NextResponse(image.data, { headers: { ...MOBILE_HEADERS, "Content-Type": image.mimeType, "Content-Length": String(image.data.byteLength), "Content-Disposition": "inline; filename=bill.jpg", ETag: `"${image.revision}"` } });
  } catch (error) { return mobileFailure(error); }
}
