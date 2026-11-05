import { NextRequest } from 'next/server';
import { requireMobileSession, MobileError } from '@/lib/server/mobile-session';
import { readMobileContractCorrectionResult } from '@/lib/server/mobile-contract-corrections';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string; key: string }> }) {
  try {
    const { user } = await requireMobileSession(request), { kind, key } = await params;
    if (kind !== 'receipts' && kind !== 'renewal') throw new MobileError('Loại sửa khoản thu không hợp lệ.');
    return mobileJson(await readMobileContractCorrectionResult(user, kind, key));
  } catch (error) { return mobileFailure(error); }
}
