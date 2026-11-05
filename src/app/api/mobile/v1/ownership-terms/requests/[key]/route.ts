import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { readMobileOwnershipTermsResult } from '@/lib/server/mobile-ownership-terms';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await readMobileOwnershipTermsResult(user, (await params).key)); }
  catch (error) { return mobileFailure(error); }
}
