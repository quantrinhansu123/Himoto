import type { NextRequest } from 'next/server';
import { readMobileCollectionFollowup, saveMobileCollectionFollowup } from '@/lib/server/mobile-collection-report';
import { mobileFailure, mobileJson } from '@/lib/server/mobile-response';
import { requireMobileSession } from '@/lib/server/mobile-session';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const { user } = await requireMobileSession(request);
    return mobileJson(await readMobileCollectionFollowup(user, (await params).id));
  } catch (error) { return mobileFailure(error); }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const { user } = await requireMobileSession(request);
    return mobileJson(await saveMobileCollectionFollowup(user, (await params).id, request));
  } catch (error) { return mobileFailure(error); }
}
