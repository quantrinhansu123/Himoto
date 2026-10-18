import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { himotoPool,ownerDatabase } from '@/lib/server/himoto-database';
import { dataAccess } from '@/lib/server/access-context';
import { readVehicleTransferTelegram } from '@/lib/server/vehicle-transfer-telegram';
import { protectDatabaseRequest, SESSION_COOKIE, verifySession } from '@/lib/server/management-session';
import { applyVehicleAction, parseVehicleAction, VehicleActionError } from '@/lib/server/vehicle-actions';

export const runtime = 'nodejs';
type Params = { params: Promise<{ id: string }> };

async function POSTHandler(request: NextRequest, { params }: Params) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  let client;
  try {
    const { id } = await params;
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id))) throw new VehicleActionError('Mã xe không hợp lệ.');
    const input = parseVehicleAction(await request.json());
    const actorId = verifySession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!actorId) throw new VehicleActionError('Phiên đăng nhập không hợp lệ.', 401);
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const data = await applyVehicleAction(client, Number(id), input, actorId);
    await client.query('COMMIT');
    if(input.action==='transfer'||input.action==='receive'){
      // A preview failure cannot turn a committed stock operation into a retryable error.
      try{if((await readVehicleTransferTelegram(ownerDatabase,Number(id),data.event_id,dataAccess.getStore()!)).state.eligible)data.telegram_event_id=data.event_id;}
      catch{data.telegram_event_id=data.event_id;}
    }
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof VehicleActionError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Thông tin thao tác không hợp lệ.' }, { status: 400 });
    if (error && typeof error === 'object' && 'code' in error && ['55P03', '40P01'].includes(String(error.code))) return NextResponse.json({ status: 'error', message: 'Xe đang được cập nhật. Thử lại sau giây lát.' }, { status: 409 });
    console.error('Vehicle action failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: 'Không lưu được thao tác xe.' }, { status: 500 });
  } finally { client?.release(); }
}

export const POST = withAccessRequest(POSTHandler);
