import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { exportMobileCashbook } from "@/lib/server/mobile-cashbook";
import { mobileFailure } from "@/lib/server/mobile-response";
import { mobileExportResponse } from '@/lib/server/mobile-export-response';
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try { const { user } = await requireMobileSession(request); return mobileExportResponse(await exportMobileCashbook(user, request.nextUrl.searchParams), request); }
  catch (error) { return mobileFailure(error); }
}
