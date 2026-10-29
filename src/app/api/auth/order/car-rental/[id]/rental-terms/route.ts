import {NextRequest,NextResponse} from 'next/server';
import {withAccessRequest} from '@/lib/server/access-request';
import {readSessionUser,SESSION_COOKIE} from '@/lib/server/management-session';
import {himotoPool} from '@/lib/server/himoto-database';
import {readRentalTerms,updateRentalTerms,RentalTermsError} from '@/lib/server/rental-terms';
import {failureResponse} from '@/lib/server/public-failure';
async function handler(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  let client;
  try {
    const {id}=await params;if(!/^[1-9]\d{0,14}$/.test(id))throw new RentalTermsError('Mã hợp đồng không hợp lệ.');
    const user=await readSessionUser(request.cookies.get(SESSION_COOKIE)?.value);if(!user)return NextResponse.json({status:'error',message:'Phiên đăng nhập đã hết hạn.'},{status:401});
    let body;try{if(request.method==='PATCH')body=await request.json();}catch{throw new RentalTermsError('Nội dung sửa tiền / ngày thuê không hợp lệ.');}
    client=await himotoPool.connect();await client.query(request.method==='PATCH'?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const data=request.method==='PATCH'?await updateRentalTerms(client,Number(id),user,body):await readRentalTerms(client,Number(id),user);
    await client.query('COMMIT');return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'no-store'}});
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});return error instanceof RentalTermsError?NextResponse.json({status:'error',message:error.message},{status:error.status}):failureResponse('Chưa lưu được tiền / ngày thuê.',error);}finally{client?.release();}
}
export const GET=withAccessRequest(handler);
export const PATCH=withAccessRequest(handler);
