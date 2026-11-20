import type { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { mobileFailure, mobileJson } from '@/lib/server/mobile-response';
import { mobileShiftId } from '@/lib/server/mobile-shift-reports';
import { mobileShiftStockPhotos } from '@/lib/server/shift-stock-photos';

export const runtime = 'nodejs';
export const maxDuration = 90;

async function handle(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const {user} = await requireMobileSession(request);
    return mobileJson(await mobileShiftStockPhotos(request, user, mobileShiftId((await params).id)));
  } catch (error) {
    return mobileFailure(error);
  }
}
export const GET = handle;
export const PUT = handle;
export const DELETE = handle;
