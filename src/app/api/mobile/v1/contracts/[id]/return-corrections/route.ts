import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { readMobileReturnCorrectionOptions, writeMobileReturnCorrection } from '@/lib/server/mobile-return-corrections';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await readMobileReturnCorrectionOptions(user, (await params).id, request.nextUrl.searchParams)); }
  catch (error) { return mobileFailure(error); }
}
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await writeMobileReturnCorrection(user, (await params).id, request)); }
  catch (error) { return mobileFailure(error); }
}
