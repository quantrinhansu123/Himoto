import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest, SESSION_COOKIE, userFromSession } from '@/lib/server/management-session';
import { ContractRenewalError, parseRenewalInput, recordContractRenewal } from '@/lib/server/contract-renewals';
import { after } from 'next/server';
import { queueContractNotification, dispatchContractNotifications } from '@/lib/server/contract-notifications';

export const runtime = 'nodejs';
type Params = { params: Promise<{ id: string }> };

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
    const data = await recordContractRenewal(client, Number(id), user.id, input);
    const version=(await client.query('SELECT draft_payload FROM himoto.orders WHERE id=$1',[Number(id)])).rows[0].draft_payload.management_composer.versions.at(-1);
    await queueContractNotification(client,Number(id),'renewal',`renewal:${id}:${data.version}`,user.id,`renewal-${data.version}`,version);
    await client.query('COMMIT');
    after(async()=>{await dispatchContractNotifications();});
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof ContractRenewalError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Thông tin gia hạn không hợp lệ.' }, { status: 400 });
    console.error('Contract renewal failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: 'Không lưu được gia hạn hợp đồng.' }, { status: 500 });
  } finally { client?.release(); }
}

export const POST = withAccessRequest(POSTHandler);
