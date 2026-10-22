import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { readTransferHistory, TransferHistoryError } from '@/lib/server/vehicle-transfer-history';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';
async function GETHandler(request: NextRequest) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ status: 'success', data: await readTransferHistory(himotoPool, request.nextUrl.searchParams) },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof TransferHistoryError) return NextResponse.json({ status: 'error', message: error.message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    return failureResponse('Không tải được lịch sử luân chuyển.', error);
  }
}

export const GET = withAccessRequest(GETHandler);
