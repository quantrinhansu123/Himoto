import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { protectDatabaseRequest, SESSION_COOKIE, userFromSession } from '@/lib/server/management-session';
import { readPhotoBody } from '@/lib/server/photo-body';
import { RecordPhotoError } from '@/lib/server/record-photos';
import { PhotoOcrError, ocrKind, limitPhotoOcr, extractPhoto } from '@/lib/server/photo-ocr';

export const runtime = 'nodejs';
export const maxDuration = 45;
async function POSTHandler(request: NextRequest) {
  const denied = await protectDatabaseRequest(request); if (denied) return denied;
  try {
    const kind = ocrKind(request.headers.get('x-photo-kind'));
    const user = await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!user) return NextResponse.json({ status: 'error', message: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
    limitPhotoOcr(user.id);
    const photo = await readPhotoBody(request);
    const data = await extractPhoto(kind, photo.mimeType, photo.data, request.signal);
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const known = error instanceof PhotoOcrError || error instanceof RecordPhotoError;
    return NextResponse.json({ status: 'error', message: known ? error.message : 'Không đọc được ảnh. Thử lại hoặc nhập tay.' }, { status: known ? error.status : 500, headers: { 'Cache-Control': 'private, no-store' } });
  }
}

export const POST = withAccessRequest(POSTHandler);
