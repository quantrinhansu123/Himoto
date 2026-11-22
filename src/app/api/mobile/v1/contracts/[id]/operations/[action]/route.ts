import type { NextRequest } from 'next/server';
import { isContractOperation, readMobileContractOperation, writeMobileContractOperation } from '@/lib/server/mobile-contract-operations';
import { mobileFailure, mobileJson } from '@/lib/server/mobile-response';
import { MobileError, requireMobileSession } from '@/lib/server/mobile-session';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string; action: string }> };

async function handle(request: NextRequest, { params }: Context) {
  try {
    const { user } = await requireMobileSession(request);
    const { id, action } = await params;
    if (!isContractOperation(action)) throw new MobileError('Không tìm thấy thao tác hợp đồng.', 404, 'NOT_FOUND');
    const result = request.method === 'GET'
      ? await readMobileContractOperation(user, id, action)
      : await writeMobileContractOperation(user, id, action, request);
    return mobileJson(result);
  } catch (error) { return mobileFailure(error); }
}

export const GET = handle;
export const POST = handle;
