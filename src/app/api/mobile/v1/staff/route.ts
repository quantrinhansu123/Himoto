import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { saveMobileStaff } from "@/lib/server/mobile-staff";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await saveMobileStaff(user, request, "POST"), 201); }
  catch (error) { return mobileFailure(error); }
}
