import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { readMobileContractEdit, writeMobileContractEdit } from '@/lib/server/mobile-contract-edit';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await readMobileContractEdit(user, (await params).id)); }
  catch (error) { return mobileFailure(error); }
}
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await writeMobileContractEdit(user, (await params).id, request)); }
  catch (error) { return mobileFailure(error); }
}
