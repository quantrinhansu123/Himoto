import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { exportMobileSalesReport } from "@/lib/server/mobile-report-export";
import { mobileFailure } from "@/lib/server/mobile-response";
import { mobileExportResponse } from '@/lib/server/mobile-export-response';
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  try { const { user } = await requireMobileSession(request); return mobileExportResponse(await exportMobileSalesReport(user, (await context.params).kind, request.nextUrl.searchParams), request); }
  catch (error) { return mobileFailure(error); }
}
