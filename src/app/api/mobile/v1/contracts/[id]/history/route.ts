import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { readMobileContractHistory } from '@/lib/server/mobile-contract-history';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await readMobileContractHistory(user, (await params).id, request.nextUrl.searchParams)); }
  catch (error) { return mobileFailure(error); }
}
