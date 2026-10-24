import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest,NextResponse } from 'next/server';
import { protectDatabaseRequest,SESSION_COOKIE,userFromSession } from '@/lib/server/management-session';
import { himotoPool } from '@/lib/server/himoto-database';
import { updateContractProfile,ContractProfileError } from '@/lib/server/contract-profile';
import { failureResponse } from '@/lib/server/public-failure';
async function PATCHHandler(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const denied=await protectDatabaseRequest(request);if(denied)return denied;const {id}=await params;let client;
  try {if(!/^[1-9]\d{0,14}$/.test(id))throw new ContractProfileError('Mã hợp đồng chưa hợp lệ.');const user=await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);if(!user)return NextResponse.json({status:'error',message:'Phiên đăng nhập hết hạn.'},{status:401});let body;try{body=await request.json();}catch{throw new ContractProfileError('Thông tin hợp đồng chưa hợp lệ.');}client=await himotoPool.connect();await client.query('BEGIN');const data=await updateContractProfile(client,Number(id),user.id,body);await client.query('COMMIT');return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'no-store'}});}
  catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});if(error&&typeof error==='object'&&'code'in error&&error.code==='23505')return NextResponse.json({status:'error',message:'Số hợp đồng đã được sử dụng. Kiểm tra số HĐ giấy trước khi lưu.'},{status:409});return error instanceof ContractProfileError ? NextResponse.json({status:'error',message:error.message},{status:error.status}) : failureResponse('Chưa lưu được hồ sơ hợp đồng.',error);}
  finally{client?.release();}
}

export const PATCH = withAccessRequest(PATCHHandler);
