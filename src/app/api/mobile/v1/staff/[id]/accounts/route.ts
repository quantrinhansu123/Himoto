import type { NextRequest } from 'next/server';
import { requireMobileSession, MobileError } from '@/lib/server/mobile-session';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
import { readStaffAccountDetails, updateStaffAccountDetails } from '@/lib/server/staff-account-details';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { AccountAccessError } from '@/lib/server/account-management';
import { AccountPasswordError } from '@/lib/server/account-passwords';
import { mobileBody } from '@/lib/server/mobile-writes';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireMobileSession(request), { id } = await params;
    if (!/^[1-9]\d{0,14}$/.test(id)) throw new MobileError('Mã nhân sự không hợp lệ.');
    return mobileJson(await readStaffAccountDetails(ownerDatabase, user, Number(id)));
  } catch (error) {
    return mobileFailure(
      error instanceof AccountAccessError
        ? new MobileError(error.message, error.status, error.status === 403 ? 'FORBIDDEN' : 'INVALID_REQUEST')
        : error,
    );
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let client;
  try {
    const { user } = await requireMobileSession(request), { id } = await params;
    if (!/^[1-9]\d{0,14}$/.test(id)) throw new MobileError('Mã nhân sự không hợp lệ.');
    const body = await mobileBody(request, 4096);
    client = await ownerDatabase.connect();
    await client.query('BEGIN');
    const result = await updateStaffAccountDetails(client, user, Number(id), body);
    await client.query('COMMIT');
    return mobileJson(result);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof AccountAccessError || error instanceof AccountPasswordError) {
      return mobileFailure(new MobileError(error.message, error.status, error.status === 403 ? 'FORBIDDEN' : error.status === 409 ? 'CONFLICT' : 'INVALID_REQUEST'));
    }
    return mobileFailure(error);
  } finally {
    client?.release();
  }
}
