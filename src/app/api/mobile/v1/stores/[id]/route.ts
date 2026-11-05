import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { readMobileStore, saveMobileStore } from "@/lib/server/mobile-stores";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await readMobileStore(user, (await context.params).id)); }
  catch (error) { return mobileFailure(error); }
}
export async function PATCH(request: NextRequest, context: Context) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await saveMobileStore(user, request, "PATCH", (await context.params).id)); }
  catch (error) { return mobileFailure(error); }
}
export async function DELETE(request: NextRequest, context: Context) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await saveMobileStore(user, request, "DELETE", (await context.params).id)); }
  catch (error) { return mobileFailure(error); }
}
