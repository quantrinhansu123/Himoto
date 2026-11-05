import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { readMobileVideo } from '@/lib/server/mobile-video-read';
import { uploadMobileRecordVideo } from '@/lib/server/mobile-record-video-write';
import { mobileFailure, mobileJson } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export const maxDuration = 300;
type Params = { params: Promise<{ entity: string; id: string; kind: string; referenceId: string; slot: string }> };
export async function GET(request: NextRequest, { params }: Params) { try { const { user } = await requireMobileSession(request), raw = await params; return await readMobileVideo(user, raw, raw.slot, request); } catch (error) { return mobileFailure(error); } }
export async function PUT(request: NextRequest, { params }: Params) { try { const { user } = await requireMobileSession(request), raw = await params; return mobileJson(await uploadMobileRecordVideo(user, raw, raw.slot, request)); } catch (error) { return mobileFailure(error); } }
