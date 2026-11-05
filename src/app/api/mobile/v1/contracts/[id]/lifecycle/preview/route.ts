import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { readMobileLifecyclePreview } from '@/lib/server/mobile-contract-lifecycle';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await readMobileLifecyclePreview(user, (await params).id, request)); }
  catch (error) { return mobileFailure(error); }
}
