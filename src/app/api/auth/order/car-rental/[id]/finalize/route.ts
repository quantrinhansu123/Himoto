import { withAccessRequest } from '@/lib/server/access-request';
import { after,NextRequest, NextResponse } from 'next/server';
import { queueContractNotification,dispatchContractNotifications } from '@/lib/server/contract-notifications';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest, SESSION_COOKIE, userFromSession } from '@/lib/server/management-session';
import { ContractFinalizeError, finalizeContractDraft, parseFinalizeInput } from '@/lib/server/contract-finalize';

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
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new ContractFinalizeError('Mã hợp đồng không hợp lệ.');
    const input = parseFinalizeInput(await request.json());
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const data = await finalizeContractDraft(client, Number(id), user.id, input);
    await queueContractNotification(client,Number(id),data.status==='deposit_contract'?'reservation':'rental',`finalize:${id}:${data.code}`,user.id,'rental');
    await client.query('COMMIT');
    after(async()=>{try{await dispatchContractNotifications();}catch{console.error('Contract notification dispatch failed.');}});
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof ContractFinalizeError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Thông tin lưu chính thức không hợp lệ.' }, { status: 400 });
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') return NextResponse.json({ status: 'error', message: 'Số hợp đồng vừa được dùng. Thử lại.' }, { status: 409 });
    console.error('Contract finalize failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: 'Không lưu chính thức được hợp đồng. Chưa có thay đổi nào được ghi.' }, { status: 500 });
  } finally { client?.release(); }
}

export const POST = withAccessRequest(POSTHandler);
