import { NextRequest, NextResponse } from 'next/server';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { himotoPool } from '@/lib/server/himoto-database';
import { CUSTOMER_IMPORT_BODY_LIMIT, CustomerImportError } from '@/lib/server/customer-import';
import { customerStoreRequest, importCustomerStores } from '@/lib/server/customer-store-import';

export const runtime = 'nodejs';

async function readBody(request: NextRequest) {
  if (Number(request.headers.get('content-length') || 0) > CUSTOMER_IMPORT_BODY_LIMIT) throw new CustomerImportError('Dữ liệu vượt quá 2 MB. Chia file thành các lần nhỏ hơn.', 413);
  if (!request.body) throw new CustomerImportError('Chưa có dữ liệu căn cước và cơ sở.');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let length = 0, text = '';
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > CUSTOMER_IMPORT_BODY_LIMIT) { await reader.cancel(); throw new CustomerImportError('Dữ liệu vượt quá 2 MB. Chia file thành các lần nhỏ hơn.', 413); }
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
    const { rows, commit, revision } = customerStoreRequest(await readBody(request));
    client = await himotoPool.connect();
    await client.query(commit ? 'BEGIN' : 'BEGIN READ ONLY');
    const result = await importCustomerStores(client, rows, commit, revision);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data: result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof CustomerImportError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Dữ liệu khớp cơ sở không hợp lệ.' }, { status: 400 });
    console.error('Customer store matching failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: 'Không xác nhận được kết quả cập nhật. Kiểm tra lại với hệ thống trước khi thử tiếp.' }, { status: 500 });
  } finally { client?.release(); }
}
