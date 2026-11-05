import { after, NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { readMobilePushStatus, registerMobilePush, disableMobilePush, dispatchMobilePush } from '@/lib/server/mobile-push';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  try { const {sessionId} = await requireMobileSession(request); return mobileJson(await readMobilePushStatus(sessionId)); }
  catch (error) { return mobileFailure(error); }
}
export async function POST(request: NextRequest) {
  try { const {user, sessionId} = await requireMobileSession(request);
    const result = await registerMobilePush(request, user.id, sessionId);
    after(async () => { try { await dispatchMobilePush(); } catch { console.error('Mobile push dispatch unavailable.'); } });
    return mobileJson(result); }
  catch (error) { return mobileFailure(error); }
}
export async function DELETE(request: NextRequest) {
  try { const {sessionId} = await requireMobileSession(request); return mobileJson(await disableMobilePush(sessionId)); }
  catch (error) { return mobileFailure(error); }
}
