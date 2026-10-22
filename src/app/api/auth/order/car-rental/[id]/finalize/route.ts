import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { queueContractNotification } from '@/lib/server/contract-notifications';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest, SESSION_COOKIE, userFromSession } from '@/lib/server/management-session';
import { ContractFinalizeError, finalizeContractDraft, parseFinalizeInput } from '@/lib/server/contract-finalize';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';
export const maxDuration=300;
type Params = { params: Promise<{ id: string }> };

async function POSTHandler(request: NextRequest, { params }: Params) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  const user = await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ status: 'error', message: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
    return NextResponse.json({ status: 'error', message: 'Mã hợp đồng không hợp lệ.' }, { status: 400 });
  }
  let input;
  try { input = parseFinalizeInput(await request.json()); }
  catch (error) {
    if (error instanceof ContractFinalizeError) return NextResponse.json({ status: 'error', message: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Thông tin lưu chính thức không hợp lệ.' }, { status: 400 });
    throw error;
  }

  // Commit the issued contract first. Queuing Telegram (and encoding attached photos) must not
  // roll back money / vehicle / status writes when the notification step times out.
  let client;
  let data;
  try {
    client = await himotoPool.connect();
    await client.query('BEGIN');
    data = await finalizeContractDraft(client, Number(id), user.id, input);
    await client.query('COMMIT');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof ContractFinalizeError) return NextResponse.json({ status: 'error', message: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status });
    return failureResponse('Không lưu chính thức được hợp đồng.', error);
  } finally { client?.release(); client = undefined; }

  try {
    client = await himotoPool.connect();
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '60s'");
    await queueContractNotification(client, Number(id), data.status === 'deposit_contract' ? 'reservation' : 'rental', `finalize:${id}:${data.code}`, user.id, 'rental');
    await client.query('COMMIT');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Contract finalize notification queue failed:', error instanceof Error ? error.message : error);
  } finally { client?.release(); }

  return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
}

export const POST = withAccessRequest(POSTHandler);
