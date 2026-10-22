import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { himotoPool } from '@/lib/server/himoto-database';
import { AccountAccessError,listManagedAccounts,saveManagedAccount } from '@/lib/server/account-management';
import { failureResponse } from '@/lib/server/public-failure';
export const runtime='nodejs';
async function handle(request:NextRequest){
  let client;
  try{
    client=await himotoPool.connect();
    if(request.method==='GET')return NextResponse.json({status:'success',data:await listManagedAccounts(client)},{headers:{'Cache-Control':'no-store'}});
    const raw=await request.json();const id=request.method==='PATCH'?Number(raw.id):undefined;
    if(request.method==='PATCH'&&(!Number.isSafeInteger(id)||!id||id<1))throw new AccountAccessError('Mã tài khoản không hợp lệ.');
    await client.query('BEGIN');const data=await saveManagedAccount(client,dataAccess.getStore()!.id,raw,id);await client.query('COMMIT');
    return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'no-store'}});
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});return error instanceof AccountAccessError?NextResponse.json({status:'error',message:error.message},{status:error.status}):failureResponse(request.method==='GET'?'Không tải được tài khoản.':'Không lưu được tài khoản.',error);}
  finally{client?.release();}
}
export const GET=withAccessRequest(handle);
export const POST=withAccessRequest(handle);
export const PATCH=withAccessRequest(handle);
