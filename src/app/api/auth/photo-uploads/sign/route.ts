import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { protectDatabaseRequest, SESSION_COOKIE, userFromSession } from '@/lib/server/management-session';
import { RecordPhotoError } from '@/lib/server/record-photos';
import { signPhotoUpload } from '@/lib/server/cloudinary-photos';
import { hasPermission } from '@/lib/management/permissions';

export const runtime = 'nodejs';
async function POSTHandler(request: NextRequest) {
  const denied = await protectDatabaseRequest(request); if (denied) return denied;
  try {
    if (Number(request.headers.get('content-length')) > 1024) throw new RecordPhotoError('Yêu cầu tải ảnh không hợp lệ.');
    const body = await request.text(); if (body.length > 1024) throw new RecordPhotoError('Yêu cầu tải ảnh không hợp lệ.');
    const input = JSON.parse(body);
    const user = await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!user) return NextResponse.json({ status: 'error', message: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
    if(!(['customers.write','contracts.draft','contracts.finalize','contracts.return','contracts.renew'] as const).some(permission=>hasPermission(user,permission)))throw new RecordPhotoError('Tài khoản chưa được phép tải ảnh.',403);
    if(input.resource_type!==undefined&&input.resource_type!=='video')throw new RecordPhotoError('Loại tệp không hợp lệ.');
    const data = signPhotoUpload(user.id, input?.upload_id, Date.now(), input.resource_type==='video');
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ status: 'error', message: error instanceof RecordPhotoError ? error.message : 'Không khởi tạo được tải ảnh Cloudinary.' }, { status: error instanceof RecordPhotoError ? error.status : 500, headers: { 'Cache-Control': 'private, no-store' } });
  }
}

export const POST = withAccessRequest(POSTHandler);
