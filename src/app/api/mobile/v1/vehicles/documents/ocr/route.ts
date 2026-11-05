import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { readMobileVehicleOcr } from "@/lib/server/mobile-vehicle-ocr";
import { mobileFailure, mobileJson } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await readMobileVehicleOcr(user, request)); }
  catch (error) { return mobileFailure(error); }
}
