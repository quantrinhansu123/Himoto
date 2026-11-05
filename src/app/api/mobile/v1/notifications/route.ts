import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { readMobileNotifications } from '@/lib/server/mobile-notifications';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  try { const {user} = await requireMobileSession(request); return mobileJson(await readMobileNotifications(user)); }
  catch (error) { return mobileFailure(error); }
}
