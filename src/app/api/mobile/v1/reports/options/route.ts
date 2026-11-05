import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { readMobileReportOptions } from "@/lib/server/mobile-reports";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await readMobileReportOptions(user)); }
  catch (error) { return mobileFailure(error); }
}
