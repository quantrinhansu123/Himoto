import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { saveMobileCashbookAccount } from "@/lib/server/mobile-cashbook";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export async function PATCH(request: NextRequest, context: { params: Promise<{ kind: string; id: string }> }) {
  try { const { user } = await requireMobileSession(request); const { kind, id } = await context.params; return mobileJson(await saveMobileCashbookAccount(user, kind, id, "status", request)); }
  catch (error) { return mobileFailure(error); }
}
