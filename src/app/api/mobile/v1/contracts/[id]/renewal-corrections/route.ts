import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { readMobileRenewalCorrections, writeMobileContractCorrection } from '@/lib/server/mobile-contract-corrections';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await readMobileRenewalCorrections(user, (await params).id)); }
  catch (error) { return mobileFailure(error); }
}
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await writeMobileContractCorrection(user, (await params).id, 'renewal', request)); }
  catch (error) { return mobileFailure(error); }
}
