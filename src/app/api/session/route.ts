import { NextRequest, NextResponse } from 'next/server';
import { authenticateAccount, checkLoginLimit, clearLoginLimit, LoginError, sameOrigin, SESSION_COOKIE, SESSION_SECONDS, signSession, userFromSession, isManagementConfigured } from '@/lib/server/management-session';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: NextRequest) {
  if (!isManagementConfigured()) return NextResponse.json({ message: 'Hệ thống chưa được cấu hình kết nối dữ liệu. Vui lòng liên hệ quản trị viên.' }, { status: 503, headers });
  if (!sameOrigin(request)) return NextResponse.json({ message: 'Yêu cầu không hợp lệ.' }, { status: 403, headers });
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || !('email' in body) || !('password' in body) || typeof body.email !== 'string' || typeof body.password !== 'string') throw new LoginError('Vui lòng nhập email và mật khẩu.', 400);
    const email = body.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !body.password || body.password.length > 256) throw new LoginError('Kiểm tra email và mật khẩu đã nhập.', 400);
    checkLoginLimit(email);
    const user = await authenticateAccount(email, body.password);
    clearLoginLimit(email);
    const response = NextResponse.json({ user }, { headers });
    response.cookies.set(SESSION_COOKIE, signSession(user.id), { httpOnly: true, sameSite: 'strict', secure: request.nextUrl.protocol === 'https:', path: '/', maxAge: SESSION_SECONDS });
    return response;
  } catch (error) {
    if (error instanceof LoginError) return NextResponse.json({ message: error.message }, { status: error.status, headers });
    if (error instanceof SyntaxError) return NextResponse.json({ message: 'Thông tin đăng nhập không hợp lệ.' }, { status: 400, headers });
    return NextResponse.json({ message: 'Không kết nối được hệ thống đăng nhập. Vui lòng thử lại.' }, { status: 503, headers });
  }
}

export async function GET(request: NextRequest) {
  if (!isManagementConfigured()) return NextResponse.json({ message: 'Hệ thống chưa được cấu hình kết nối dữ liệu.' }, { status: 503, headers });
  try {
    const user = await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);
    return NextResponse.json({ user }, { status: user ? 200 : 401, headers });
  } catch { return NextResponse.json({ message: 'Không xác thực được phiên đăng nhập.' }, { status: 503, headers }); }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ message: 'Yêu cầu không hợp lệ.' }, { status: 403, headers });
  const response = NextResponse.json({ success: true }, { headers });
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'strict', secure: request.nextUrl.protocol === 'https:', path: '/', maxAge: 0 });
  return response;
}
