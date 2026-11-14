import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { himotoPool } from '@/lib/server/himoto-database';
import { canSettleContract } from '@/lib/management/permissions';
import { ContractPaymentError } from '@/lib/server/contract-payments';
import { settleContract } from '@/lib/server/contract-settlement';
import { failureResponse } from '@/lib/server/public-failure';
export const runtime='nodejs';
export const POST=withAccessRequest(async(request:NextRequest,{params}:{params:Promise<{id:string}>})=>{
  const actor=dataAccess.getStore()!;
  if(!canSettleContract(actor))return NextResponse.json({status:'error',message:'Tài khoản không có quyền thanh toán/đóng hợp đồng.'},{status:403});
  let client;
  try{
    const {id}=await params;
    if(!/^[1-9]\d{0,14}$/.test(id)||!Number.isSafeInteger(Number(id)))throw new ContractPaymentError('Mã hợp đồng không hợp lệ.');
    const raw=await request.json();client=await himotoPool.connect();await client.query('BEGIN');
    const data=await settleContract(client,Number(id),actor.id,raw);await client.query('COMMIT');
    return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    if(client)await client.query('ROLLBACK').catch(()=>{});
    if(error instanceof ContractPaymentError)return NextResponse.json({status:'error',message:error.message},{status:error.status});
    if(error instanceof SyntaxError)return NextResponse.json({status:'error',message:'Thông tin thao tác không hợp lệ.'},{status:400});
    return failureResponse('Chưa xác nhận được thanh toán/đóng hợp đồng.',error);
  }finally{client?.release();}
});
