import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from './himoto-database';
import { protectDatabaseRequest, SESSION_COOKIE, verifySession } from './management-session';
import { VehicleSaveError, createDatabaseVehicle, parseVehicleValues, updateDatabaseVehicle } from './vehicle-management';
import { failureResponse } from './public-failure';

export async function saveVehicle(request: NextRequest, id: number | null) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  let client;
  try {
    const values = parseVehicleValues(await request.json());
    const actorId = verifySession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!actorId) throw new VehicleSaveError('Phiên đăng nhập không hợp lệ.', 401);
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const data = id === null ? await createDatabaseVehicle(client, values, actorId) : await updateDatabaseVehicle(client, id, values, actorId);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data }, { status: id === null ? 201 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof VehicleSaveError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Thông tin xe không hợp lệ.' }, { status: 400 });
    if (error && typeof error === 'object' && 'code' in error && ['23505', '55P03', '40P01'].includes(String(error.code))) {
      return failureResponse('Biển số bị trùng hoặc danh sách xe đang được cập nhật.', error);
    }
    return failureResponse('Không lưu được xe.', error);
  } finally { client?.release(); }
}
