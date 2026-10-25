import { NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { himotoPool } from '@/lib/server/himoto-database';
import { correctReturn,parseReturnCorrection,readReturnCorrection } from '@/lib/server/return-corrections';
import { ContractReturnError } from '@/lib/server/contract-returns';
import { ContractPaymentError } from '@/lib/server/contract-payments';
import { failureResponse } from '@/lib/server/public-failure';
export const runtime='nodejs';
export const maxDuration=120;
const headers={'Cache-Control':'private, no-store'};
async function handler(request:NextRequest) {
  let client;
  try{
    const user=dataAccess.getStore()!;
    const writing=request.method==='PATCH';
    const body=writing?parseReturnCorrection(await request.json()):null;
    client=await himotoPool.connect();await client.query(request.method==='PATCH'?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const data=writing?await correctReturn(client,user.id,body):await readReturnCorrection(client,Number(request.nextUrl.searchParams.get('item_id')));
    await client.query('COMMIT');return NextResponse.json({status:'success',data},{headers});
  }catch(error){
    if(client)await client.query('ROLLBACK').catch(()=>{});
    if(error instanceof ContractReturnError||error instanceof ContractPaymentError)return NextResponse.json({status:'error',message:error.message},{status:error.status,headers});
    if(error instanceof SyntaxError)return NextResponse.json({status:'error',message:'Thông tin sửa trả xe không hợp lệ.'},{status:400,headers});
    return failureResponse('Chưa lưu được bản sửa trả xe. Giữ nội dung và thử lại.',error);
  }finally{client?.release();}
}
export const GET=withAccessRequest(handler);
export const PATCH=withAccessRequest(handler);
