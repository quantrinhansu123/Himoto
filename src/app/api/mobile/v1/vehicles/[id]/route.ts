import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { readMobileVehicleProfile, saveMobileVehicle } from "@/lib/server/mobile-vehicles";
import { mobileFailure, mobileJson } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await readMobileVehicleProfile(user, (await context.params).id)); }
  catch (error) { return mobileFailure(error); }
}
export async function PATCH(request: NextRequest, context: Context) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await saveMobileVehicle(user, (await context.params).id, request)); }
  catch (error) { return mobileFailure(error); }
}
