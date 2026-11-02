import {NextRequest,NextResponse} from 'next/server';
import {withAccessRequest} from '@/lib/server/access-request';
import {dataAccess} from '@/lib/server/access-context';
import {himotoPool} from '@/lib/server/himoto-database';
import {ContractPaymentError} from '@/lib/server/contract-payments';
import {readReceiptCorrections,updateReceiptCorrections} from '@/lib/server/receipt-corrections';
import {failureResponse} from '@/lib/server/public-failure';
async function handler(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 let client;try{
  const {id}=await params;if(!/^[1-9]\d{0,14}$/.test(id)||!Number.isSafeInteger(Number(id)))throw new ContractPaymentError('Mã hợp đồng không hợp lệ.');
  const user=dataAccess.getStore();if(!user)return NextResponse.json({status:'error',message:'Phiên đăng nhập đã hết hạn.'},{status:401});
  const body=request.method==='PATCH'?await request.json():undefined;
  client=await himotoPool.connect();await client.query(request.method==='GET'?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
  const data=request.method==='GET'?await readReceiptCorrections(client,Number(id),user):await updateReceiptCorrections(client,Number(id),user,body);
  await client.query('COMMIT');return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'no-store'}});
 }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});return error instanceof SyntaxError?NextResponse.json({status:'error',message:'Thông tin sửa không hợp lệ.'},{status:400}):failureResponse('Chưa lưu được tiền cọc / khoản thu.',error);}finally{client?.release();}
}
export const GET=withAccessRequest(handler);
export const PATCH=withAccessRequest(handler);
