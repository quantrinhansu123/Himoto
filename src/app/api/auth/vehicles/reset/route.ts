import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { protectDatabaseRequest, SESSION_COOKIE, verifySession } from '@/lib/server/management-session';
import { himotoPool } from '@/lib/server/himoto-database';
import { previewVehicleReset, readVehicleRequestBody, resetDatabaseVehicles, VehicleImportError } from '@/lib/server/vehicle-import';
import { failureResponse } from '@/lib/server/public-failure';

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
    return failureResponse('Không xác nhận được kết quả xóa xe.', error);
  } finally { client?.release(); }
}
const GETHandler = (request: NextRequest) => handle(request, false);
const DELETEHandler = (request: NextRequest) => handle(request, true);

export const GET = withAccessRequest(GETHandler);
export const DELETE = withAccessRequest(DELETEHandler);
