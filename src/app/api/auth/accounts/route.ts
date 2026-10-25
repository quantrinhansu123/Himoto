import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { AccountAccessError,listManagedAccounts,saveManagedAccount,deleteManagedAccount,requireAccountScope } from '@/lib/server/account-management';
import { failureResponse } from '@/lib/server/public-failure';
import { AccountPasswordError } from '@/lib/server/account-passwords';
import { SESSION_COOKIE,SESSION_SECONDS,signSession } from '@/lib/server/management-session';
export const runtime='nodejs';
async function handle(request:NextRequest){
  let client;
  try{
    const user=dataAccess.getStore()!;requireAccountScope(user);
    client=await ownerDatabase.connect();
    if(request.method==='GET'){
      const selected=request.nextUrl.searchParams.get('store_id');
      if(selected!==null&&!/^[1-9]\d{0,14}$/.test(selected))throw new AccountAccessError('Cơ sở không hợp lệ.');
      return NextResponse.json({status:'success',data:await listManagedAccounts(client,user,selected===null?null:Number(selected))},{headers:{'Cache-Control':'private, no-store'}});
    }
    const raw=await request.json();
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new AccountAccessError('Thông tin tài khoản không hợp lệ.');
    const id=request.method!=='POST'?Number(raw.id):undefined;
    if(request.method!=='POST'&&(!Number.isSafeInteger(id)||!id||id<1))throw new AccountAccessError('Mã tài khoản không hợp lệ.');
    await client.query('BEGIN');const data=request.method==='DELETE'
      ?await deleteManagedAccount(client,user.id,id!,String(raw.revision||''),user)
      :await saveManagedAccount(client,user.id,raw,id,user);await client.query('COMMIT');
    const response=NextResponse.json({status:'success',data},{headers:{'Cache-Control':'private, no-store'}});
    if(id===user.id&&'password_version' in data&&typeof data.password_version==='number')response.cookies.set(SESSION_COOKIE,signSession(user.id,undefined,Date.now(),data.password_version),{httpOnly:true,sameSite:'strict',secure:request.nextUrl.protocol==='https:',path:'/',maxAge:SESSION_SECONDS});
    return response;
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});
    if(error instanceof SyntaxError)return NextResponse.json({status:'error',message:'Thông tin tài khoản không hợp lệ.'},{status:400});
    if(error&&typeof error==='object'&&'code' in error&&error.code==='23505')return NextResponse.json({status:'error',message:'Tên đăng nhập đã tồn tại. Chọn tên khác.'},{status:409});
    return error instanceof AccountAccessError||error instanceof AccountPasswordError?NextResponse.json({status:'error',message:error.message},{status:error.status}):failureResponse(request.method==='GET'?'Không tải được tài khoản.':'Không lưu được tài khoản.',error);}
  finally{client?.release();}
}
export const GET=withAccessRequest(handle);
export const POST=withAccessRequest(handle);
export const PATCH=withAccessRequest(handle);
export const DELETE=withAccessRequest(handle);
