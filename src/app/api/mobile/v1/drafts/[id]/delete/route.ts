import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { readMobileDraftDelete, writeMobileDraftDelete } from '@/lib/server/mobile-draft-delete';
import { mobileJson, mobileFailure } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await readMobileDraftDelete(user, (await params).id)); } catch (error) { return mobileFailure(error); }
}
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { user } = await requireMobileSession(request); return mobileJson(await writeMobileDraftDelete(user, (await params).id, request)); } catch (error) { return mobileFailure(error); }
}
