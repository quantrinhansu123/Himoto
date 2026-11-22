import type { NextRequest } from 'next/server';
import { mobileDepositRefundState, mobileRefundFailure, saveMobileDepositRefund } from '@/lib/server/mobile-deposit-refunds';
import { mobileJson } from '@/lib/server/mobile-response';
import { requireMobileSession } from '@/lib/server/mobile-session';

export const runtime = 'nodejs';
export const maxDuration = 60;
type Context = { params: Promise<{ id: string; itemId: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const { user } = await requireMobileSession(request);
    const { id, itemId } = await params;
    return mobileJson(await mobileDepositRefundState(user, id, itemId));
  } catch (error) { return mobileRefundFailure(error); }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const { user } = await requireMobileSession(request);
    const { id, itemId } = await params;
    return mobileJson(await saveMobileDepositRefund(user, id, itemId, request));
  } catch (error) { return mobileRefundFailure(error); }
}
