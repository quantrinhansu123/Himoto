import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { mobileVehicleTemplate } from '@/lib/server/mobile-vehicle-import';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await mobileVehicleTemplate(user, request)); }
  catch (error) { return mobileFailure(error); }
}
