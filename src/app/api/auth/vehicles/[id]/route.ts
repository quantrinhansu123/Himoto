import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { saveVehicle } from '@/lib/server/vehicle-route';

export const runtime = 'nodejs';
async function PATCHHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rawId = (await params).id, id = Number(rawId);
  if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ status: 'error', message: 'Mã xe không hợp lệ.' }, { status: 400 });
  return saveVehicle(request, id);
}

export const PATCH = withAccessRequest(PATCHHandler);
