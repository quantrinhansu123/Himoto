import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { readTransferHistory, TransferHistoryError } from '@/lib/server/vehicle-transfer-history';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ status: 'success', data: await readTransferHistory(himotoPool, request.nextUrl.searchParams) },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ status: 'error', message: error instanceof TransferHistoryError ? error.message : 'Không tải được lịch sử luân chuyển. Vui lòng thử lại.' },
      { status: error instanceof TransferHistoryError ? 400 : 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
