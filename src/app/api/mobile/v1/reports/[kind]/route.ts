import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { readMobileSalesReport } from "@/lib/server/mobile-reports";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await readMobileSalesReport(user, (await context.params).kind, request.nextUrl.searchParams)); }
  catch (error) { return mobileFailure(error); }
}
