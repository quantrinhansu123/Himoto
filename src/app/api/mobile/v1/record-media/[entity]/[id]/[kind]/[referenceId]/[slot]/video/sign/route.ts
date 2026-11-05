import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { signMobileRecordVideo } from '@/lib/server/mobile-record-video-write';
import { mobileFailure, mobileJson } from '@/lib/server/mobile-response';
export const runtime = 'nodejs';
export async function POST(request: NextRequest, { params }: { params: Promise<{entity:string;id:string;kind:string;referenceId:string;slot:string}> }) {
  try { const {user} = await requireMobileSession(request), raw = await params; return mobileJson(await signMobileRecordVideo(user,raw,raw.slot,request)); } catch(error) { return mobileFailure(error); }
}
