import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { writeMobileCustomer } from "@/lib/server/mobile-customers";
import { mobileFailure, mobileJson } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireMobileSession(request);
    return mobileJson(await writeMobileCustomer(user, request, null), 201);
  } catch (error) {
    return mobileFailure(error);
  }
}
