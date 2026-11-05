import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { readMobileCashbookAccount, saveMobileCashbookAccount } from "@/lib/server/mobile-cashbook";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
type Context = { params: Promise<{ kind: string; id: string }> };
export async function GET(request: NextRequest, context: Context) {
  try { const { user } = await requireMobileSession(request); const { kind, id } = await context.params; return mobileJson(await readMobileCashbookAccount(user, kind, id)); }
  catch (error) { return mobileFailure(error); }
}
export async function PATCH(request: NextRequest, context: Context) {
  try { const { user } = await requireMobileSession(request); const { kind, id } = await context.params; return mobileJson(await saveMobileCashbookAccount(user, kind, id, "update", request)); }
  catch (error) { return mobileFailure(error); }
}
export async function DELETE(request: NextRequest, context: Context) {
  try { const { user } = await requireMobileSession(request); const { kind, id } = await context.params; return mobileJson(await saveMobileCashbookAccount(user, kind, id, "delete", request)); }
  catch (error) { return mobileFailure(error); }
}
