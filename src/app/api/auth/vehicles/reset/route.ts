import { NextRequest, NextResponse } from 'next/server';
import { protectDatabaseRequest, SESSION_COOKIE, verifySession } from '@/lib/server/management-session';
import { himotoPool } from '@/lib/server/himoto-database';
import { previewVehicleReset, readVehicleRequestBody, resetDatabaseVehicles, VehicleImportError } from '@/lib/server/vehicle-import';

export const runtime = 'nodejs';
async function handle(request: NextRequest, remove: boolean) {
  const denied = await protectDatabaseRequest(request); if (denied) return denied;
  let client;
  try {
    const actorId = verifySession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!actorId) throw new VehicleImportError('Phiên đăng nhập không hợp lệ.', 401);
    const body = remove ? await readVehicleRequestBody(request) : undefined;
    client = await himotoPool.connect();
    await client.query(remove ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const data = remove ? await resetDatabaseVehicles(client, body, actorId) : await previewVehicleReset(client);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof VehicleImportError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Yêu cầu xóa không hợp lệ.' }, { status: 400 });
    console.error('Vehicle reset failed:', error instanceof Error ? error.name : 'Database error');
    return NextResponse.json({ status: 'error', message: 'Không xác nhận được kết quả. Làm mới danh sách xe trước khi thử lại.' }, { status: 500 });
  } finally { client?.release(); }
}
export const GET = (request: NextRequest) => handle(request, false);
export const DELETE = (request: NextRequest) => handle(request, true);
