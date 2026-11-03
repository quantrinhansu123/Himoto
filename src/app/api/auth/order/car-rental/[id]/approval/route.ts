import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest,SESSION_COOKIE,userFromSession } from '@/lib/server/management-session';
import { approveIssuedContract,readContractApproval,ContractApprovalError } from '@/lib/server/contract-approval';
import { failureResponse } from '@/lib/server/public-failure';
async function handle(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const denied=await protectDatabaseRequest(request);if(denied)return denied;
  let db;
  try {
    const {id}=await params;if(!/^[1-9]\d{0,14}$/.test(id))throw new ContractApprovalError('Mã hợp đồng chưa hợp lệ.');
    const user=await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);if(!user)return NextResponse.json({status:'error',message:'Phiên đăng nhập hết hạn.'},{status:401});
    let body;
    if(request.method==='PATCH'){try{body=await request.json();}catch{throw new ContractApprovalError('Thông tin duyệt chưa hợp lệ.');}}
    db=await himotoPool.connect();await db.query('BEGIN');
    const data=request.method==='PATCH'?await approveIssuedContract(db,Number(id),user,body):await readContractApproval(db,Number(id),user);
    await db.query('COMMIT');return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'no-store'}});
  }catch(cause){if(db)await db.query('ROLLBACK').catch(()=>{});return cause instanceof ContractApprovalError?NextResponse.json({status:'error',message:cause.message},{status:cause.status}):failureResponse('Chưa duyệt được hợp đồng.',cause);}
  finally{db?.release();}
}
export const GET=withAccessRequest(handle);
export const PATCH=withAccessRequest(handle);
