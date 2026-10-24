import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { queueContractNotification } from '@/lib/server/contract-notifications';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest, SESSION_COOKIE, userFromSession } from '@/lib/server/management-session';
import { ContractReturnError, loadContractReturnableItems, parseReturnBatch, searchReturnableItems } from '@/lib/server/contract-returns';
import { parseReturnSettlements,completeReturnBatch } from '@/lib/server/return-settlements';
import { ContractPaymentError } from '@/lib/server/contract-payments';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';
export const maxDuration=300;

async function GETHandler(request: NextRequest) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  try {
    const query = request.nextUrl.searchParams.get('query') || '';
    const rawOrderId = request.nextUrl.searchParams.get('order_id');
    const data = rawOrderId ? await loadContractReturnableItems(himotoPool, Number(rawOrderId),request.nextUrl.searchParams.get('recovery')==='1') : await searchReturnableItems(himotoPool, query);
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failureResponse('Không tải được danh sách xe cần trả.', error);
  }
}

async function POSTHandler(request: NextRequest) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  const user = await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ status: 'error', message: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
  let client;
  try {
    const body = await request.json();
    const inputs = parseReturnBatch(body);
    const settlements=parseReturnSettlements(body?.settlements);
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const results = await completeReturnBatch(client,user.id,inputs,settlements);
    const returned=(await client.query('SELECT id,order_id FROM himoto.order_vehicle_details WHERE id=ANY($1::bigint[])',[inputs.map(input=>input.item_id)])).rows;
    const byOrder=new Map<number,number[]>();for(const row of returned){const orderId=Number(row.order_id);byOrder.set(orderId,[...(byOrder.get(orderId)||[]),Number(row.id)]);}
    for(const [orderId,items] of byOrder){items.sort((a,b)=>a-b);await queueContractNotification(client,orderId,'return',`return:${orderId}:${items.join(',')}`,user.id,items.map(item=>`return-${item}`));}
    await client.query('COMMIT');
    const data = body && typeof body === 'object' && 'items' in body ? results : results[0];
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof ContractReturnError||error instanceof ContractPaymentError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Thông tin trả xe không hợp lệ.' }, { status: 400 });
    return failureResponse('Chưa ghi nhận được lần trả xe.', error);
  } finally { client?.release(); }
}

export const GET = withAccessRequest(GETHandler);
export const POST = withAccessRequest(POSTHandler);
