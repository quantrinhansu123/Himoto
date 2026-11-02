import { NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { readDashboardSummary } from '@/lib/server/dashboard';
import { RentalReportError } from '@/lib/server/rental-reports';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';

async function GETHandler(request: NextRequest) {
  try {
    return NextResponse.json(
      { status: 'success', data: await readDashboardSummary(himotoPool, request.nextUrl.searchParams) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return error instanceof RentalReportError
      ? NextResponse.json({ status: 'error', message: error.message }, { status: 400 })
      : failureResponse('Không tải được Dashboard giao dịch.', error);
  }
}

export const GET = withAccessRequest(GETHandler);
