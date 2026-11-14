import { NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { SESSION_COOKIE, userFromSession } from '@/lib/server/management-session';
import { DutyError } from '@/lib/server/duty-roster';
import { readSelfRegistrationWeek, saveSelfRegistrationWeek } from '@/lib/server/self-shift-registration';
import { vietnamDate, weekStart } from '@/lib/management/duty-roster';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';
async function handle(request: NextRequest) {
  let client;
  try {
    const user = await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!user) return NextResponse.json({ status: 'error', message: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
    const writing = request.method === 'PUT';
    let body: unknown;
    if (writing) {
      const text = await request.text();
      if (text.length > 8192) throw new DutyError('Thông tin đăng ký quá dài.');
      body = JSON.parse(text);
    }
    // Same owner connection as attendance: every query derives staff from the session,
    // never from a client-supplied staff/store ID and never from the history filter.
    client = await ownerDatabase.connect();
    await client.query(writing ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const today = vietnamDate();
    const data = writing ? await saveSelfRegistrationWeek(client, user, body, today) : await readSelfRegistrationWeek(client, user, request.nextUrl.searchParams.get('week') || weekStart(today), today);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof DutyError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Thông tin đăng ký không hợp lệ.' }, { status: 400 });
    return failureResponse('Chưa xác nhận được đăng ký ca. Tải lại để kiểm tra trước khi lưu lại.', error);
  } finally { client?.release(); }
}
export const GET = withAccessRequest(handle);
export const PUT = withAccessRequest(handle);
