import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { readMobileCashbook } from "@/lib/server/mobile-cashbook";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await readMobileCashbook(user, request.nextUrl.searchParams)); }
  catch (error) { return mobileFailure(error); }
}
