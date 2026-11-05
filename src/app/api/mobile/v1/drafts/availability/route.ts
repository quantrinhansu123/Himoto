import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { readMobileDraftAvailability } from "@/lib/server/mobile-draft-lookups";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireMobileSession(request);
    return mobileJson(await readMobileDraftAvailability(user, request));
  } catch (error) {
    return mobileFailure(error);
  }
}
