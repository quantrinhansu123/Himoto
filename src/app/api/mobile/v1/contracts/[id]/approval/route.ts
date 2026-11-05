import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { readMobileContractApproval, writeMobileContractApproval } from '@/lib/server/mobile-contract-approval';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await readMobileContractApproval(user, (await params).id)); }
  catch (error) { return mobileFailure(error); }
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await writeMobileContractApproval(user, (await params).id, request)); }
  catch (error) { return mobileFailure(error); }
}
