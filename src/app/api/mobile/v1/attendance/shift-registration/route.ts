import type { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
import { mobileShiftRegistration } from '@/lib/server/mobile-shift-registration';
export const runtime = 'nodejs';
export const maxDuration = 30;
export async function GET(request: NextRequest) { try { const { user } = await requireMobileSession(request); return mobileJson(await mobileShiftRegistration(user, request, true)); } catch (error) { return mobileFailure(error); } }
export const PUT = GET;
