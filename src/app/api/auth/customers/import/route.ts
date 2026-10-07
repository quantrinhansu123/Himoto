import { NextRequest, NextResponse } from 'next/server';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { himotoPool } from '@/lib/server/himoto-database';
import { CUSTOMER_IMPORT_BODY_LIMIT, CustomerImportError, customerImportRequest, importDatabaseCustomers } from '@/lib/server/customer-import';

export const runtime = 'nodejs';

async function readImportBody(request: NextRequest) {
  if (Number(request.headers.get('content-length') || 0) > CUSTOMER_IMPORT_BODY_LIMIT) throw new CustomerImportError('Dữ liệu vượt quá 2 MB. Chia file thành các lần nhập nhỏ hơn.', 413);
  if (!request.body) throw new CustomerImportError('Chưa có dữ liệu khách hàng.');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let length = 0, text = '';
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > CUSTOMER_IMPORT_BODY_LIMIT) { await reader.cancel(); throw new CustomerImportError('Dữ liệu vượt quá 2 MB. Chia file thành các lần nhập nhỏ hơn.', 413); }
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally { reader.releaseLock(); }
}

export async function POST(request: NextRequest) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  let client;
  try {
    const { rows, commit, allowIncomplete } = customerImportRequest(await readImportBody(request));
    client = await himotoPool.connect();
    await client.query(commit ? 'BEGIN' : 'BEGIN READ ONLY');
    const result = await importDatabaseCustomers(client, rows, commit, allowIncomplete);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data: result }, { status: commit ? 201 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof CustomerImportError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Dữ liệu nhập không hợp lệ.' }, { status: 400 });
    if (error && typeof error === 'object' && 'code' in error && (error.code === '23505' || error.code === '23503')) return NextResponse.json({ status: 'error', message: 'Khách hàng hoặc cơ sở đã thay đổi. Kiểm tra lại file trước khi nhập.' }, { status: 409 });
    console.error('Customer Excel import failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: 'Không xác nhận được kết quả nhập. Kiểm tra lại file với hệ thống trước khi thử nhập lại.' }, { status: 500 });
  } finally { client?.release(); }
}
