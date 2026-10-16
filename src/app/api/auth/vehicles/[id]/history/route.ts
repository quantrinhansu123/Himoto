import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { readVehicleHistory, VehicleHistoryError } from '@/lib/server/vehicle-history';

export const runtime = 'nodejs';
type Params = { params: Promise<{ id: string }> };

async function GETHandler(request: NextRequest, { params }: Params) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!/^\d+$/.test(id)) throw new VehicleHistoryError('Mã xe không hợp lệ.');
    const data = await readVehicleHistory(himotoPool, Number(id));
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof VehicleHistoryError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    console.error('Vehicle history failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: 'Không tải được lịch sử xe.' }, { status: 500 });
  }
}

export const GET = withAccessRequest(GETHandler);
