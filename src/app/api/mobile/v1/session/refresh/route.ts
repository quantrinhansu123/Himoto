import { NextRequest } from 'next/server';
import { assertMobileRequest, MobileError } from '@/lib/server/mobile-session';
import { mobileBody } from '@/lib/server/mobile-writes';
import { mobileFailure, mobileJson } from '@/lib/server/mobile-response';
import { rotateMobileSession } from '@/lib/server/mobile-refresh';

export const runtime = 'nodejs';
export const maxDuration = 30;
export async function POST(request: NextRequest) {
  try {
    assertMobileRequest(request);
    const body = await mobileBody(request, 1024);
    if (Object.keys(body).some(key => !['refreshToken', 'rotationId'].includes(key)) || typeof body.refreshToken !== 'string' || typeof body.rotationId !== 'string')
      throw new MobileError('Thông tin gia hạn phiên không hợp lệ.', 400, 'INVALID_REFRESH');
    return mobileJson(await rotateMobileSession(body.refreshToken, body.rotationId));
  } catch (error) { return mobileFailure(error); }
}
