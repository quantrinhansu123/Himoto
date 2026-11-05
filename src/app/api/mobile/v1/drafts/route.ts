import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { writeMobileDraft } from "@/lib/server/mobile-drafts";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireMobileSession(request);
    return mobileJson(await writeMobileDraft(user, request, null), 201);
  } catch (error) {
    return mobileFailure(error);
  }
}
