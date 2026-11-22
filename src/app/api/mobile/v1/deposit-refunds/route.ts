import type { NextRequest } from 'next/server';
import { mobileDepositRefundQueue, mobileRefundFailure } from '@/lib/server/mobile-deposit-refunds';
import { mobileJson } from '@/lib/server/mobile-response';
import { requireMobileSession } from '@/lib/server/mobile-session';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireMobileSession(request);
    return mobileJson(await mobileDepositRefundQueue(user, request.nextUrl.searchParams));
  } catch (error) { return mobileRefundFailure(error); }
}
