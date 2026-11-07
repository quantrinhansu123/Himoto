import { NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { SESSION_COOKIE, userFromSession } from '@/lib/server/management-session';
import { handleAttendance } from '@/lib/server/attendance-handler';
export const runtime = 'nodejs';
async function handle(request: NextRequest) {
  const user = await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({status:'error',message:'Phiên đăng nhập đã hết hạn.'},{status:401});
  return handleAttendance(request, user);
}
export const GET = withAccessRequest(handle);
export const POST = withAccessRequest(handle);
