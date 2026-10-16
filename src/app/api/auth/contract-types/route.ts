import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest, SESSION_COOKIE, userFromSession } from '@/lib/server/management-session';
import { canRecordContractPayment } from '@/lib/management/permissions';
import { ContractTypeError, listContractTypes, saveContractType } from '@/lib/server/contract-types';

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
    const duplicate = error && typeof error === 'object' && 'code' in error && error.code === '23505';
    return NextResponse.json({status:'error',message:duplicate ? 'Tên loại hợp đồng đã có. Dùng lại hoặc đổi tên khác.' : error instanceof ContractTypeError ? error.message : 'Không tải hoặc lưu được loại hợp đồng.'},{status:duplicate ? 409 : error instanceof ContractTypeError ? error.status : error instanceof SyntaxError ? 400 : 500});
  } finally { client?.release(); }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
