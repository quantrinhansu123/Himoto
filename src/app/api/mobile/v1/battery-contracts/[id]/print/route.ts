import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { readMobileBatteryPrint } from '@/lib/server/mobile-battery-print';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
import { MobileError } from '@/lib/server/mobile-session';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { user } = await requireMobileSession(request); if (request.nextUrl.searchParams.size) throw new MobileError('Mẫu in pin / sạc không hỗ trợ bộ lọc này.'); return mobileJson(await readMobileBatteryPrint(user, (await params).id)); }
  catch (error) { return mobileFailure(error); }
}
