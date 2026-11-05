import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { readMobileDraftOptions } from "@/lib/server/mobile-drafts";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireMobileSession(request);
    return mobileJson(await readMobileDraftOptions(user));
  } catch (error) {
    return mobileFailure(error);
  }
}
