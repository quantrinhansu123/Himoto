import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { readMobileReturnCorrection } from '@/lib/server/mobile-return-corrections';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try { const { user } = await requireMobileSession(request), { id, itemId } = await params; return mobileJson(await readMobileReturnCorrection(user, id, itemId)); }
  catch (error) { return mobileFailure(error); }
}
