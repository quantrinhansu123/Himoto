import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { saveMobileCashbookAccount } from "@/lib/server/mobile-cashbook";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await saveMobileCashbookAccount(user, (await context.params).kind, null, "create", request), 201); }
  catch (error) { return mobileFailure(error); }
}
