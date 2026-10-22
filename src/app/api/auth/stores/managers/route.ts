import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';
async function GETHandler(request: NextRequest) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  try {
    const result = await himotoPool.query("SELECT id, name FROM himoto.users WHERE deleted_at IS NULL AND status='active' ORDER BY name, id");
    return NextResponse.json({ status: 'success', data: result.rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failureResponse('Không tải được danh sách người phụ trách.', error);
  }
}

export const GET = withAccessRequest(GETHandler);
