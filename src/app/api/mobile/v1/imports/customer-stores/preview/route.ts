import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { readMobileStoreMatch } from '@/lib/server/mobile-customer-store-import';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await readMobileStoreMatch(user, request)); }
  catch (error) { return mobileFailure(error); }
}
