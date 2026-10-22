import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest, SESSION_COOKIE, userFromSession } from '@/lib/server/management-session';
import { canRecordContractPayment } from '@/lib/management/permissions';
import { ContractTypeError, listContractTypes, saveContractType } from '@/lib/server/contract-types';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';
async function handle(request: NextRequest) {
  const denied = await protectDatabaseRequest(request); if (denied) return denied;
  let client;
  try {
    const user = request.method === 'GET' ? null : await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);
    if (request.method !== 'GET' && !canRecordContractPayment(user)) return NextResponse.json({status:'error',message:'Tài khoản chưa có quyền quản lý loại hợp đồng.'},{status:403});
    const body = request.method === 'GET' ? null : await request.json();
    client = await himotoPool.connect(); await client.query(request.method === 'GET' ? 'BEGIN READ ONLY' : 'BEGIN');
    const data = request.method === 'GET' ? await listContractTypes(client) : await saveContractType(client,body,user!.id,request.method === 'PATCH');
    await client.query('COMMIT');
    return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(()=>{});
    if (error instanceof ContractTypeError) return NextResponse.json({status:'error',message:error.message},{status:error.status});
    if (error instanceof SyntaxError) return NextResponse.json({status:'error',message:'Thông tin loại hợp đồng không hợp lệ.'},{status:400});
    return failureResponse(request.method === 'GET' ? 'Không tải được loại hợp đồng.' : 'Không lưu được loại hợp đồng.', error);
  } finally { client?.release(); }
}
const GETHandler = handle;
const POSTHandler = handle;
const PATCHHandler = handle;

export const GET = withAccessRequest(GETHandler);
export const POST = withAccessRequest(POSTHandler);
export const PATCH = withAccessRequest(PATCHHandler);
