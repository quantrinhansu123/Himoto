import { NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { readPendingContractTelegram } from '@/lib/server/contract-telegram-pending';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';
export const GET = withAccessRequest(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams, store = params.get('store'), page = params.get('page') || '1';
  if (store && store !== 'all' && !/^[1-9]\d{0,14}$/.test(store) || !/^[1-9]\d{0,3}$/.test(page)) {
    return NextResponse.json({status:'error',message:'Bộ lọc giao dịch không hợp lệ.'},{status:400});
  }
  try {
    const data = await readPendingContractTelegram(himotoPool, store && store !== 'all' ? Number(store) : null, Number(page));
    return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'private, no-store'}});
  } catch (error) {
    return failureResponse('Không tải được giao dịch chưa gửi Telegram.', error);
  }
});
