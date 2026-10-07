import { NextRequest, NextResponse } from 'next/server';
import { protectDatabaseRequest, SESSION_COOKIE, verifySession } from '@/lib/server/management-session';
import { himotoPool } from '@/lib/server/himoto-database';
import { importDatabaseVehicles, readVehicleRequestBody, vehicleImportRequest, VehicleImportError } from '@/lib/server/vehicle-import';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  const denied = await protectDatabaseRequest(request); if (denied) return denied;
  let client;
  try {
    const body = vehicleImportRequest(await readVehicleRequestBody(request));
    const actorId = verifySession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!actorId) throw new VehicleImportError('Phiên đăng nhập không hợp lệ.', 401);
    client = await himotoPool.connect();
    await client.query(body.commit ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const data = await importDatabaseVehicles(client, body, actorId);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data }, { status: body.commit ? 201 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof VehicleImportError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Dữ liệu nhập không hợp lệ.' }, { status: 400 });
    if (error && typeof error === 'object' && 'code' in error && ['23505', '23503', '55P03', '40P01'].includes(String(error.code))) return NextResponse.json({ status: 'error', message: 'Dữ liệu đang thay đổi hoặc có xung đột. Đã hủy lần nhập; kiểm tra lại.' }, { status: 409 });
    console.error('Vehicle import failed:', error instanceof Error ? error.name : 'Database error');
    return NextResponse.json({ status: 'error', message: 'Chưa xác nhận được kết quả nhập. Làm mới và kiểm tra dữ liệu trước khi thử lại.' }, { status: 500 });
  } finally { client?.release(); }
}
