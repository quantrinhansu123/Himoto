import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { previewMobileBatteryPrint } from "@/lib/server/mobile-battery-print";
import { mobileFailure, mobileJson } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireMobileSession(request);
    return mobileJson(await previewMobileBatteryPrint(user, request));
  } catch (error) {
    return mobileFailure(error);
  }
}
