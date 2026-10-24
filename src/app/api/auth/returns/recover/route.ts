import { NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest, SESSION_COOKIE, userFromSession } from '@/lib/server/management-session';
import { ContractReturnError, parseBadDebtRecovery, recordBadDebtRecovery } from '@/lib/server/contract-returns';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime='nodejs';
export const POST=withAccessRequest(async(request:NextRequest)=>{
  const denied=await protectDatabaseRequest(request);if(denied)return denied;
  let client;
  try {
    const user=await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);
    if(!user)return NextResponse.json({status:'error',message:'Phiên đăng nhập đã hết hạn.'},{status:401});
    const raw=await request.text();if(raw.length>8192)throw new ContractReturnError('Thông tin thu hồi vượt giới hạn.',413);
    const input=parseBadDebtRecovery(JSON.parse(raw));
    client=await himotoPool.connect();await client.query('BEGIN');
    const data=await recordBadDebtRecovery(client,user.id,input);
    await client.query('COMMIT');
    return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    if(client)await client.query('ROLLBACK').catch(()=>{});
    if(error instanceof ContractReturnError)return NextResponse.json({status:'error',message:error.message},{status:error.status});
    if(error instanceof SyntaxError)return NextResponse.json({status:'error',message:'Thông tin thu hồi không hợp lệ.'},{status:400});
    return failureResponse('Chưa ghi nhận được thu hồi xe. Giữ thông tin và thử lại.',error);
  }finally{client?.release();}
});
