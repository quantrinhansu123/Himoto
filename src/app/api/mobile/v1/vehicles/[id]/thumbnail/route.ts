import { NextRequest, NextResponse } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { readMobileVehicleThumbnail } from '@/lib/server/mobile-record-media';
import { MOBILE_HEADERS, mobileFailure } from '@/lib/server/mobile-response';

export const runtime = 'nodejs';
export const maxDuration = 30;
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireMobileSession(request), { id } = await params;
    const thumbnail = await readMobileVehicleThumbnail(user, id, request);
    if (thumbnail.notModified) return new NextResponse(null, { status: 304, headers: { ...MOBILE_HEADERS, 'ETag': thumbnail.etag } });
    return new NextResponse(new Uint8Array(thumbnail.data), { headers: { ...MOBILE_HEADERS, 'Content-Type': 'image/jpeg', 'Content-Length': String(thumbnail.data.byteLength), 'ETag': thumbnail.etag } });
  } catch (error) { return mobileFailure(error); }
}
