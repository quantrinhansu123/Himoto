import { NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { himotoPool } from '@/lib/server/himoto-database';
import { deleteContractDraft, DraftDeleteError } from '@/lib/server/contract-draft-delete';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';
type Params = { params: Promise<{ id: string }> };

export const DELETE = withAccessRequest(async (request: NextRequest, { params }: Params) => {
  let client;
  try {
    const { id } = await params;
    if (!/^[1-9]\d{0,14}$/.test(id)) throw new DraftDeleteError('Mã bản nháp không hợp lệ.');
    const text = await request.text();
    if (text.length > 256) throw new DraftDeleteError('Yêu cầu quá lớn.', 413);
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'revision')) {
      throw new DraftDeleteError('Thông tin bản nháp không hợp lệ.');
    }
    client = await himotoPool.connect();
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15s'");
    await deleteContractDraft(client, Number(id), body.revision, dataAccess.getStore()!.id);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data: { id: Number(id) } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof DraftDeleteError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Thông tin bản nháp không hợp lệ.' }, { status: 400 });
    return failureResponse('Không xóa được bản nháp. Làm mới danh sách để kiểm tra.', error);
  } finally { client?.release(); }
});
