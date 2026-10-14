import { NextRequest,NextResponse } from 'next/server';
import { protectDatabaseRequest,SESSION_COOKIE,userFromSession } from '@/lib/server/management-session';
import { himotoPool } from '@/lib/server/himoto-database';
import { updateContractProfile,ContractProfileError } from '@/lib/server/contract-profile';
export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const denied=await protectDatabaseRequest(request);if(denied)return denied;const {id}=await params;let client;
  try {if(!/^[1-9]\d*$/.test(id))throw new ContractProfileError('Mã hợp đồng chưa hợp lệ.');const user=await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);if(!user)return NextResponse.json({status:'error',message:'Phiên đăng nhập hết hạn.'},{status:401});const body=await request.json();client=await himotoPool.connect();await client.query('BEGIN');const data=await updateContractProfile(client,Number(id),user.id,body);await client.query('COMMIT');return NextResponse.json({status:'success',data});}
  catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});return NextResponse.json({status:'error',message:error instanceof ContractProfileError ? error.message : 'Chưa lưu được hồ sơ hợp đồng.'},{status:error instanceof ContractProfileError ? error.status : 500});}
  finally{client?.release();}
}
