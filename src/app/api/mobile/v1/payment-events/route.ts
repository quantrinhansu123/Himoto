import type { NextRequest } from 'next/server';
import { hasPermission } from '@/lib/management/permissions';
import { himotoPool } from '@/lib/server/himoto-database';
import { withMobileData } from '@/lib/server/mobile-context';
import { mobileFailure, mobileJson } from '@/lib/server/mobile-response';
import { MobileError, requireMobileSession } from '@/lib/server/mobile-session';
import { readSePayReceiptEvents } from '@/lib/server/sepay-events';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireMobileSession(request);
    if (!hasPermission(user, 'contracts.read')) throw new MobileError('Tài khoản chưa có quyền xem thanh toán.', 403, 'FORBIDDEN');
    const params = request.nextUrl.searchParams, cursor = params.get('after') ?? '0';
    if ([...params.keys()].some(key => key !== 'after' || params.getAll(key).length !== 1) || !/^\d{1,16}$/.test(cursor)) {
      throw new MobileError('Mốc thông báo thanh toán không hợp lệ.');
    }
    return mobileJson(await withMobileData(user, '', () => readSePayReceiptEvents(himotoPool, cursor)));
  } catch (error) { return mobileFailure(error); }
}
