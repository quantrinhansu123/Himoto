import type { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { readMobileCustomerMatches } from "@/lib/server/mobile-customer-matches";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireMobileSession(request);
    return mobileJson(await readMobileCustomerMatches(user, request));
  } catch (error) {
    return mobileFailure(error);
  }
}
