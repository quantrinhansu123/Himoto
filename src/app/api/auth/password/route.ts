import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { AccountPasswordError,changeOwnPassword } from '@/lib/server/account-passwords';
import { SESSION_COOKIE,SESSION_SECONDS,signSession,checkLoginLimit,clearLoginLimit,LoginError } from '@/lib/server/management-session';
import { failureResponse } from '@/lib/server/public-failure';
export const runtime='nodejs';
export const PATCH=withAccessRequest(async(request:NextRequest)=>{
  let client;
  try{
    const actor=dataAccess.getStore()!,raw=await request.text();
    if(raw.length>4096)throw new AccountPasswordError('Thông tin đổi mật khẩu quá dài.');
    const body=JSON.parse(raw);
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['current_password','new_password','confirmation'].includes(key)))throw new AccountPasswordError('Thông tin đổi mật khẩu không hợp lệ.');
    const limitKey=`password-change:${actor.id}`;checkLoginLimit(limitKey);
    client=await ownerDatabase.connect();await client.query('BEGIN');
    const changed=await changeOwnPassword(client,actor.id,body.current_password,body.new_password,body.confirmation);
    await client.query('COMMIT');clearLoginLimit(limitKey);
    const response=NextResponse.json({status:'success',data:{changed_at:changed.changed_at}},{headers:{'Cache-Control':'private, no-store'}});
    response.cookies.set(SESSION_COOKIE,signSession(actor.id,undefined,Date.now(),changed.password_version),{httpOnly:true,sameSite:'strict',secure:request.nextUrl.protocol==='https:',path:'/',maxAge:SESSION_SECONDS});
    return response;
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});
    if(error instanceof SyntaxError)return NextResponse.json({status:'error',message:'Thông tin đổi mật khẩu không hợp lệ.'},{status:400});
    return error instanceof AccountPasswordError||error instanceof LoginError?NextResponse.json({status:'error',message:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}}):failureResponse('Chưa đổi được mật khẩu.',error);
  }finally{client?.release();}
});
