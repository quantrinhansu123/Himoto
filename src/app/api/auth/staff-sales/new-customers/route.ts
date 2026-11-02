import { NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { himotoPool } from '@/lib/server/himoto-database';
import { newCustomersBySource, NewCustomersBySourceError } from '@/lib/server/new-customers-by-source';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';

async function GETHandler(request: NextRequest) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  const query = request.nextUrl.searchParams;
  try {
    const data = await newCustomersBySource(
      himotoPool,
      query.get('from') || '',
      query.get('to') || '',
      query.has('store_id') ? Number(query.get('store_id')) : undefined,
    );
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return error instanceof NewCustomersBySourceError
      ? NextResponse.json({ status: 'error', message: error.message }, { status: error.status })
      : failureResponse('Không tải được danh sách khách hàng mới.', error);
  }
}

export const GET = withAccessRequest(GETHandler);
