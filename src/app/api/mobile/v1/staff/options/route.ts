import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { readMobileStaffOptions } from "@/lib/server/mobile-staff";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await readMobileStaffOptions(user)); }
  catch (error) { return mobileFailure(error); }
}
