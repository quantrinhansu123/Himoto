import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { readMobileStoreMatchFile, streamMobileStoreMatchFile } from '@/lib/server/mobile-customer-store-import';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try { const { user } = await requireMobileSession(request); return request.headers.get('accept') === 'application/x-ndjson' ? await streamMobileStoreMatchFile(user, request) : mobileJson(await readMobileStoreMatchFile(user, request)); }
  catch (error) { return mobileFailure(error); }
}
