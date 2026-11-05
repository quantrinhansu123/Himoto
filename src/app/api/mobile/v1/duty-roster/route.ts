import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { readMobileDuties, writeMobileDuty } from "@/lib/server/mobile-duty-roster";
import { mobileFailure, mobileJson } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await readMobileDuties(user, request.nextUrl.searchParams)); }
  catch (error) { return mobileFailure(error); }
}
export async function POST(request: NextRequest) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await writeMobileDuty(user, request, "POST"), 201); }
  catch (error) { return mobileFailure(error); }
}
