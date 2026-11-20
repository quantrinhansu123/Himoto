import type { NextRequest } from 'next/server';
import { MobileError, requireMobileSession } from '@/lib/server/mobile-session';
import { mobileFailure, mobileJson } from '@/lib/server/mobile-response';
import { mobileShiftId } from '@/lib/server/mobile-shift-reports';
import { mobileShiftStockPhotos } from '@/lib/server/shift-stock-photos';
import { isShiftStockCheck, SHIFT_STOCK_FORMAT_HEADER, SHIFT_STOCK_PLATE_FORMAT } from '../../../../../../../../shared/shift-stock-check';

export const runtime = 'nodejs';
export const maxDuration = 90;

async function handle(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const {user} = await requireMobileSession(request);
    const result = await mobileShiftStockPhotos(request, user, mobileShiftId((await params).id));
    if (request.method==='GET' && request.headers.get(SHIFT_STOCK_FORMAT_HEADER)!==SHIFT_STOCK_PLATE_FORMAT &&
        isShiftStockCheck(result) && result.captures.some(capture=>capture.vehicle_photo_id===null)) {
      throw new MobileError('Cập nhật Himoto trong mục Tài khoản để tiếp tục kiểm kê bằng ảnh biển số.',409,'UPDATE_REQUIRED');
    }
    return mobileJson(result);
  } catch (error) {
    return mobileFailure(error);
  }
}
export const GET = handle;
export const PUT = handle;
export const DELETE = handle;
