import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { readMobileCashbookTransactions } from "@/lib/server/mobile-cashbook";
import { mobileJson, mobileFailure } from "@/lib/server/mobile-response";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ kind: string; id: string }> }) {
  try { const { user } = await requireMobileSession(request); const { kind, id } = await context.params; return mobileJson(await readMobileCashbookTransactions(user, kind, id, request.nextUrl.searchParams)); }
  catch (error) { return mobileFailure(error); }
}
