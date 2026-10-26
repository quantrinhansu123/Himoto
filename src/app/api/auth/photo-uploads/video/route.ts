import { NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { RecordPhotoError } from '@/lib/server/record-photos';
import { browserVideosEnabled, signBrowserVideo, completeBrowserVideo } from '@/lib/server/browser-videos';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';
export const maxDuration = 180;
async function POSTHandler(request: NextRequest) {
  try {
    const user = dataAccess.getStore()!;
    // Mọi tài khoản đã đăng nhập đều được tải video lên web.
    const reader = request.body?.getReader();
    if (!reader) throw new RecordPhotoError('Thiếu thông tin video.');
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.length; if (size > 2048) { await reader.cancel(); throw new RecordPhotoError('Thông tin video quá lớn.', 413); }
      chunks.push(part.value);
    } } finally { reader.releaseLock(); }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RecordPhotoError('Thông tin video không hợp lệ.');
    const data = input.action === 'config' ? { enabled: browserVideosEnabled() }
      : input.action === 'sign' ? await signBrowserVideo(user.id, input)
      : input.action === 'verify' ? await completeBrowserVideo(user.id, input.ticket)
      : (() => { throw new RecordPhotoError('Thao tác video không hợp lệ.'); })();
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof RecordPhotoError || error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: error instanceof RecordPhotoError ? error.message : 'Thông tin video không hợp lệ.' }, { status: error instanceof RecordPhotoError ? error.status : 400 });
    return failureResponse('Chưa xử lý được video. Tệp vẫn được giữ để thử lại.', error);
  }
}
export const POST = withAccessRequest(POSTHandler);
