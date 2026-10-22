import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { protectDatabaseRequest, SESSION_COOKIE, userFromSession } from '@/lib/server/management-session';
import { readPhotoBody,readPhotoBatchBody } from '@/lib/server/photo-body';
import { RecordPhotoError } from '@/lib/server/record-photos';
import { PhotoOcrError, ocrKind, limitPhotoOcr, extractPhoto } from '@/lib/server/photo-ocr';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';
export const maxDuration = 45;
async function POSTHandler(request: NextRequest) {
  const denied = await protectDatabaseRequest(request); if (denied) return denied;
  try {
    const kind = ocrKind(request.headers.get('x-photo-kind'));
    const user = await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!user) return NextResponse.json({ status: 'error', message: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
    limitPhotoOcr(user.id);
    const batch=request.headers.get('content-type')?.startsWith('multipart/form-data');
    if(batch&&kind!=='customer_documents')throw new PhotoOcrError('Bộ ảnh cần chọn chế độ đọc giấy tờ khách hàng.');
    const photos=batch?await readPhotoBatchBody(request):[await readPhotoBody(request)];
    const expected=request.headers.get('x-expected-identity')||'';
    if(expected&&!/^[A-Z0-9-]{3,100}$/i.test(expected))throw new PhotoOcrError('Số giấy tờ đối chiếu chưa hợp lệ.');
    const data = await extractPhoto(kind, photos[0].mimeType, photos[0].data, request.signal,fetch,{additional:photos.slice(1),expectedIdentity:expected});
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const known = error instanceof PhotoOcrError || error instanceof RecordPhotoError;
    if (known) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status, headers: { 'Cache-Control': 'private, no-store' } });
    return failureResponse('Không đọc được ảnh. Thử lại hoặc nhập tay.', error);
  }
}

export const POST = withAccessRequest(POSTHandler);
