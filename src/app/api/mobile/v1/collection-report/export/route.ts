import type { NextRequest } from 'next/server';
import { exportMobileCollectionReport } from '@/lib/server/mobile-collection-report';
import { mobileExportResponse } from '@/lib/server/mobile-export-response';
import { mobileFailure } from '@/lib/server/mobile-response';
import { requireMobileSession } from '@/lib/server/mobile-session';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireMobileSession(request);
    return mobileExportResponse(await exportMobileCollectionReport(user, request.nextUrl.searchParams), request);
  } catch (error) { return mobileFailure(error); }
}
