import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest, SESSION_COOKIE, userFromSession } from '@/lib/server/management-session';
import { ContractRenewalError, parseRenewalInput } from '@/lib/server/contract-renewals';
import { renewContractAndCollect } from '@/lib/server/contract-renewal-collection';
import { ContractPaymentError } from '@/lib/server/contract-payments';
import { queueContractNotification } from '@/lib/server/contract-notifications';
import { failureResponse } from '@/lib/server/public-failure';
import { readRenewalPhotoContext } from '@/lib/server/contract-renewal-version';

export const runtime = 'nodejs';
type Params = { params: Promise<{ id: string }> };

async function GETHandler(_request: NextRequest, { params }: Params) {
  let client;
  try {
    const { id } = await params;
    if (!/^[1-9]\d{0,14}$/.test(id) || !Number.isSafeInteger(Number(id))) throw new ContractRenewalError('Mã hợp đồng không hợp lệ.');
    client = await himotoPool.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='15s'");
    const data = await readRenewalPhotoContext(client, Number(id));
    await client.query('COMMIT');
    if (!data) return NextResponse.json({ status: 'error', message: 'Không tìm thấy hợp đồng.' }, { status: 404 });
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof ContractRenewalError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    return failureResponse('Không tải được mục ảnh gia hạn. Vui lòng thử lại.', error);
  } finally { client?.release(); }
}

async function POSTHandler(request: NextRequest, { params }: Params) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  const user = await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ status: 'error', message: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
  let client;
  try {
    const { id } = await params;
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new ContractRenewalError('Mã hợp đồng không hợp lệ.');
    const input = parseRenewalInput(await request.json());
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const data = await renewContractAndCollect(client, Number(id), user.id, input);
    if (!data.replayed) {
      const versions=(await client.query('SELECT draft_payload FROM himoto.orders WHERE id=$1',[Number(id)])).rows[0].draft_payload.management_composer.versions;
      await queueContractNotification(client,Number(id),'renewal',`renewal:${id}:${data.version}`,user.id,`renewal-${data.version}`,versions.find((v:{version:number})=>v.version===data.version));
    }
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof ContractRenewalError || error instanceof ContractPaymentError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Thông tin gia hạn không hợp lệ.' }, { status: 400 });
    return failureResponse('Không lưu được gia hạn hợp đồng.', error);
  } finally { client?.release(); }
}

export const POST = withAccessRequest(POSTHandler);
export const GET = withAccessRequest(GETHandler);
