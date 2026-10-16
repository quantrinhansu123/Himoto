import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { RecordPhotoError, parsePhotoTarget, readRecordPhotos } from '@/lib/server/record-photos';

export const runtime = 'nodejs';
async function GETHandler(request: NextRequest, { params }: { params: Promise<{ entity: string; id: string }> }) {
  const denied = await protectDatabaseRequest(request); if (denied) return denied;
  try {
    const raw = await params, target = parsePhotoTarget(raw.entity, raw.id);
    const data = await readRecordPhotos(himotoPool, target.entity, target.id);
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ status: 'error', message: error instanceof RecordPhotoError ? error.message : 'Không tải được ảnh hồ sơ.' }, { status: error instanceof RecordPhotoError ? error.status : 500 });
  }
}

export const GET = withAccessRequest(GETHandler);
