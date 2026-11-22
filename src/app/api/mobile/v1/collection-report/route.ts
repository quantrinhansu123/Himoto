import { after, type NextRequest } from 'next/server';
import { readMobileCollectionReport, sendMobileCollectionReport } from '@/lib/server/mobile-collection-report';
import { mobileFailure, mobileJson } from '@/lib/server/mobile-response';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { deliverReportTelegram } from '@/lib/server/report-telegram';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireMobileSession(request);
    return mobileJson(await readMobileCollectionReport(user, request.nextUrl.searchParams));
  } catch (error) { return mobileFailure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireMobileSession(request);
    const keys = await sendMobileCollectionReport(user, request);
    after(async () => { for (const key of keys) await deliverReportTelegram(key); });
    return mobileJson({ queued: keys.length });
  } catch (error) { return mobileFailure(error); }
}
