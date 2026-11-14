import { NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest, SESSION_COOKIE, userFromSession } from '@/lib/server/management-session';
import { DutyError } from '@/lib/server/duty-roster';
import { readRegistrationMonth, readRegistrationRange, saveRegistration } from '@/lib/server/shift-registration';
import { vietnamDate } from '@/lib/management/duty-roster';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';
async function handle(request: NextRequest) {
  const denied = await protectDatabaseRequest(request); if (denied) return denied;
  let client;
  try {
    const writing = request.method === 'PUT';
    const user = writing ? await userFromSession(request.cookies.get(SESSION_COOKIE)?.value) : null;
    if (writing && !user) return NextResponse.json({ status: 'error', message: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
    const raw = writing ? await request.json() : null;
    client = await himotoPool.connect();
    await client.query(writing ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const params = request.nextUrl.searchParams;
    const data = writing ? await saveRegistration(client, user!.id, raw)
      : params.has('from') || params.has('to') ? await readRegistrationRange(client, params.get('from') || '', params.get('to') || '')
      : await readRegistrationMonth(client, params.get('month') || vietnamDate().slice(0, 7));
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof DutyError || error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: error instanceof DutyError ? error.message : 'Dữ liệu đăng ký không hợp lệ.' }, { status: error instanceof DutyError ? error.status : 400 });
    if ((error as { code?: string })?.code === '42P01') return NextResponse.json({ status: 'error', message: 'Chưa cài đặt bảng đăng ký ca. Cần chạy migration 2026-11-14-shift-registrations.sql.' }, { status: 503 });
    return failureResponse('Không tải hoặc lưu được đăng ký ca. Làm mới bảng để kiểm tra.', error);
  } finally { client?.release(); }
}
export const GET = withAccessRequest(handle);
export const PUT = withAccessRequest(handle);
