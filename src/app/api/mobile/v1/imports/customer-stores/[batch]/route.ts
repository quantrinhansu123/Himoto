import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { writeMobileStoreMatch } from '@/lib/server/mobile-customer-store-import';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: NextRequest, context: { params: Promise<{ batch: string }> }) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await writeMobileStoreMatch(user, (await context.params).batch, request)); }
  catch (error) { return mobileFailure(error); }
}
