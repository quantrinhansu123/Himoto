import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { readMobileContractPrint } from '@/lib/server/mobile-contract-print';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await readMobileContractPrint(user, (await params).id, request.nextUrl.searchParams)); }
  catch (error) { return mobileFailure(error); }
}
