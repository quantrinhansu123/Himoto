import { NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { AccountAccessError } from '@/lib/server/account-management';
import { readStaffAccountDetails, updateStaffAccountDetails } from '@/lib/server/staff-account-details';
import { AccountPasswordError } from '@/lib/server/account-passwords';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';
export const GET = withAccessRequest(async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await context.params;
    if (!/^[1-9]\d{0,14}$/.test(id)) throw new AccountAccessError('Mã nhân sự không hợp lệ.');
    const data = await readStaffAccountDetails(ownerDatabase, dataAccess.getStore()!, Number(id));
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
  } catch (error) {
    if (error instanceof AccountAccessError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
    return failureResponse('Không tải được tài khoản của nhân sự.', error);
  }
});

export const PATCH = withAccessRequest(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  let client;
  try {
    const { id } = await context.params;
    if (!/^[1-9]\d{0,14}$/.test(id)) throw new AccountAccessError('Mã nhân sự không hợp lệ.');
    const text = await request.text();
    if (text.length > 4096) throw new AccountAccessError('Thông tin tài khoản quá dài.');
    const body = JSON.parse(text);
    client = await ownerDatabase.connect();
    await client.query('BEGIN');
    const data = await updateStaffAccountDetails(client, dataAccess.getStore()!, Number(id), body);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof AccountAccessError || error instanceof AccountPasswordError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Thông tin tài khoản không hợp lệ.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    if ((error as { code?: string })?.code === '23505') return NextResponse.json({ status: 'error', message: 'Tên đăng nhập đã tồn tại. Chọn tên khác.' }, { status: 409 });
    return failureResponse('Chưa xác nhận được thay đổi tài khoản. Tải lại để kiểm tra trước khi lưu lại.', error);
  } finally { client?.release(); }
});
