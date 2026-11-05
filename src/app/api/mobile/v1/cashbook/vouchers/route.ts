import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { deleteMobileVouchers } from "@/lib/server/mobile-cashbook";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export async function DELETE(request: NextRequest) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await deleteMobileVouchers(user, request)); }
  catch (error) { return mobileFailure(error); }
}
