import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { readMobileNotificationList } from '@/lib/server/mobile-notifications';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: NextRequest, context: {params: Promise<{kind: string}>}) {
  try { const {user} = await requireMobileSession(request), {kind} = await context.params;
    return mobileJson(await readMobileNotificationList(user,kind,request.nextUrl.searchParams)); }
  catch (error) { return mobileFailure(error); }
}
