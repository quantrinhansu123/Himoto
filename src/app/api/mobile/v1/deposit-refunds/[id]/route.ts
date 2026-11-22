import { NextResponse, type NextRequest } from 'next/server';
import { decideMobileDepositRefund, mobileDepositRefundRequest, mobileRefundFailure } from '@/lib/server/mobile-deposit-refunds';
import { MOBILE_HEADERS, mobileJson } from '@/lib/server/mobile-response';
import { requireMobileSession } from '@/lib/server/mobile-session';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const { user } = await requireMobileSession(request);
    const result = await mobileDepositRefundRequest(user, (await params).id, request.nextUrl.searchParams);
    if (result.evidence) {
      return new NextResponse(new Uint8Array(result.evidence), { headers: { ...MOBILE_HEADERS, 'Content-Type': 'image/jpeg' } });
    }
    return mobileJson(result.request);
  } catch (error) { return mobileRefundFailure(error); }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const { user } = await requireMobileSession(request);
    return mobileJson(await decideMobileDepositRefund(user, (await params).id, request));
  } catch (error) { return mobileRefundFailure(error); }
}
