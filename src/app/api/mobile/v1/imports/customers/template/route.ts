import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { mobileCustomerImportTemplate } from '@/lib/server/mobile-customer-import';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await mobileCustomerImportTemplate(user)); } catch (error) { return mobileFailure(error); }
}
