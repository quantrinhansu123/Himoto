import type { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { exportMobileCashbookAccounts } from '@/lib/server/mobile-cashbook';
import { mobileExportResponse } from '@/lib/server/mobile-export-response';
import { mobileFailure } from '@/lib/server/mobile-response';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    const {user} = await requireMobileSession(request);
    return mobileExportResponse(await exportMobileCashbookAccounts(user,request.nextUrl.searchParams),request);
  } catch (error) {
    return mobileFailure(error);
  }
}
