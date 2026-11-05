import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { saveMobileVehicle } from "@/lib/server/mobile-vehicles";
import { mobileFailure, mobileJson } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await saveMobileVehicle(user, null, request), 201); }
  catch (error) { return mobileFailure(error); }
}
