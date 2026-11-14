import type { NextRequest } from 'next/server';
import { requireMobileSession, MobileError } from '@/lib/server/mobile-session';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
import { readStaffAccountDetails } from '@/lib/server/staff-account-details';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { AccountAccessError } from '@/lib/server/account-management';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireMobileSession(request), { id } = await params;
    if (!/^[1-9]\d{0,14}$/.test(id)) throw new MobileError('Mã nhân sự không hợp lệ.');
    return mobileJson(await readStaffAccountDetails(ownerDatabase, user, Number(id)));
  } catch (error) { return mobileFailure(error instanceof AccountAccessError ? new MobileError(error.message, error.status, error.status === 403 ? 'FORBIDDEN' : 'INVALID_REQUEST') : error); }
}
