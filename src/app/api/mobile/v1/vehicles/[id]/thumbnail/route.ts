import { NextRequest, NextResponse } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { readMobileRecordMediaImage } from '@/lib/server/mobile-record-media';
import { mobileThumbnail } from '@/lib/server/mobile-thumbnail';
import { MOBILE_HEADERS, mobileFailure } from '@/lib/server/mobile-response';

export const runtime = 'nodejs';
export const maxDuration = 30;
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireMobileSession(request), { id } = await params;
    const image = await readMobileRecordMediaImage(user, { entity: 'vehicles', id, kind: 'vehicle', referenceId: id }, 'vehicle-photo', request);
    const data = await mobileThumbnail(image.data);
    return new NextResponse(new Uint8Array(data), { headers: { ...MOBILE_HEADERS, 'Content-Type': 'image/jpeg', 'Content-Length': String(data.byteLength), 'ETag': `"thumbnail-${image.revision}"` } });
  } catch (error) { return mobileFailure(error); }
}
