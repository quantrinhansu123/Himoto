import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { readMobileVehicleOptions } from "@/lib/server/mobile-vehicles";
import { mobileFailure, mobileJson } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await readMobileVehicleOptions(user)); }
  catch (error) { return mobileFailure(error); }
}
