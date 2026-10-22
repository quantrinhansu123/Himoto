import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { queueContractNotification } from '@/lib/server/contract-notifications';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest, SESSION_COOKIE, userFromSession } from '@/lib/server/management-session';
import { ContractFinalizeError } from '@/lib/server/contract-finalize';
import { handoverReservation, parseHandoverInput } from '@/lib/server/contract-handover';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';
async function POSTHandler(request: NextRequest, {params}: {params: Promise<{id:string}>}) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  const user = await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({status:'error',message:'Phiên đăng nhập đã hết hạn.'},{status:401});
  let client;
  try {
    const {id} = await params;
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id)<=0) throw new ContractFinalizeError('Mã đơn giữ xe không hợp lệ.');
    const input = parseHandoverInput(await request.json());
    client = await himotoPool.connect(); await client.query('BEGIN');
    const data = await handoverReservation(client,Number(id),user.id,input.revision);
    await queueContractNotification(client,Number(id),'handover',`handover:${id}`,user.id,'handover');
    await client.query('COMMIT');
    return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    if (client) await client.query('ROLLBACK').catch(()=>{});
    if (error instanceof ContractFinalizeError) return NextResponse.json({status:'error',message:error.message},{status:error.status});
    if (error instanceof SyntaxError) return NextResponse.json({status:'error',message:'Thông tin giao xe không hợp lệ.'},{status:400});
    return failureResponse('Chưa xác nhận được giao xe.',error);
  } finally {client?.release();}
}

export const POST = withAccessRequest(POSTHandler);
