import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { readMobileVehicleImportResult } from '@/lib/server/mobile-vehicle-import';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: NextRequest, context: { params: Promise<{ key: string }> }) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await readMobileVehicleImportResult(user, (await context.params).key)); }
  catch (error) { return mobileFailure(error); }
}
