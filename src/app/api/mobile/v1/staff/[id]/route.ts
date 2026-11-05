import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { readMobileStaff, saveMobileStaff } from "@/lib/server/mobile-staff";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await readMobileStaff(user, (await context.params).id)); }
  catch (error) { return mobileFailure(error); }
}
export async function PATCH(request: NextRequest, context: Context) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await saveMobileStaff(user, request, "PATCH", (await context.params).id)); }
  catch (error) { return mobileFailure(error); }
}
export async function DELETE(request: NextRequest, context: Context) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await saveMobileStaff(user, request, "DELETE", (await context.params).id)); }
  catch (error) { return mobileFailure(error); }
}
