import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { himotoPool } from '@/lib/server/himoto-database';
import { readOwnershipTerms,updateOwnershipTerms,OwnershipTermsError } from '@/lib/server/ownership-terms';
import { failureResponse } from '@/lib/server/public-failure';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
async function handle(request:NextRequest,{params}:Context,writing:boolean) {
  let client;
  try {
    const {id}=await params;if(!/^[1-9]\d{0,14}$/.test(id))throw new OwnershipTermsError('Mã hợp đồng chưa hợp lệ.');
    let input:unknown;
    if(writing){const body=await request.text();if(body.length>2048)throw new OwnershipTermsError('Thông tin cập nhật quá dài.',413);try{input=JSON.parse(body);}catch{throw new OwnershipTermsError('Thông tin cập nhật chưa hợp lệ.');}}
    client=await himotoPool.connect();await client.query(writing?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const user=dataAccess.getStore()!;
    const data=writing?await updateOwnershipTerms(client,Number(id),user,input):await readOwnershipTerms(client,Number(id),user);
    await client.query('COMMIT');return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});return error instanceof OwnershipTermsError?NextResponse.json({status:'error',message:error.message},{status:error.status}):failureResponse('Chưa cập nhật được thời hạn và mức đóng thuê sở hữu.',error);}
  finally{client?.release();}
}
export const GET=withAccessRequest((request:NextRequest,context:Context)=>handle(request,context,false));
export const PATCH=withAccessRequest((request:NextRequest,context:Context)=>handle(request,context,true));
