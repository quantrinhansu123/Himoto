import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { exportMobileCatalogue } from '@/lib/server/mobile-catalogue-export';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await exportMobileCatalogue(user, (await context.params).kind, request)); }
  catch (error) { return mobileFailure(error); }
}
