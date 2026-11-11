import { NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { boundedObjectBytes, cloudflyPhotosEnabled, uploadObjectPhoto } from '@/lib/server/object-media';
import { RecordPhotoError } from '@/lib/server/record-photos';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';
export const maxDuration = 90;
export const POST = withAccessRequest(async (request: NextRequest) => {
  try {
    if (!cloudflyPhotosEnabled()) return NextResponse.json({ status: 'error', message: 'Kho ảnh CloudFly chưa được bật.' }, { status: 503 });
    const id = request.headers.get('x-upload-id') || '';
    const mime=request.headers.get('content-type')||'';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || !['image/jpeg','image/png','image/webp'].includes(mime)) throw new RecordPhotoError('Cần ảnh JPEG, PNG hoặc WebP đã chuẩn bị và mã tải hợp lệ.');
    const length = request.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > 2097152)) throw new RecordPhotoError('Mỗi ảnh tối đa 2 MB.', 413);
    if (!request.body) throw new RecordPhotoError('Chưa nhận được ảnh.');
    const bytes = await boundedObjectBytes(request.body, 2097152);
    const receipt = await uploadObjectPhoto(bytes, mime, dataAccess.getStore()!.id, id);
    return NextResponse.json({ status: 'success', data: receipt }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof RecordPhotoError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    return failureResponse('Chưa tải được ảnh lên CloudFly. Ảnh vẫn được giữ trong form.', error);
  }
});
