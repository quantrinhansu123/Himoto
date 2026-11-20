import type { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
import { previewMobileDraftPrint } from '@/lib/server/mobile-contract-print';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const {user} = await requireMobileSession(request);
    return mobileJson(await previewMobileDraftPrint(user,request));
  } catch (error) {
    return mobileFailure(error);
  }
}
