import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { canRecoverAccountPasswords } from '@/lib/management/permissions';
import { AccountPasswordError,revealAccountPassword,resetAccountPassword } from '@/lib/server/account-passwords';
import { SESSION_COOKIE,SESSION_SECONDS,signSession } from '@/lib/server/management-session';
import { failureResponse } from '@/lib/server/public-failure';
export const runtime='nodejs';
export const POST=withAccessRequest(async(request:NextRequest)=>{
  let client;
  try{
    const actor=dataAccess.getStore()!;
    if(!canRecoverAccountPasswords(actor))throw new AccountPasswordError('Chỉ tài khoản quanlyvanhanh được xem hoặc đặt lại mật khẩu.',403);
    const raw=await request.text();if(raw.length>4096)throw new AccountPasswordError('Thông tin mật khẩu quá dài.');
    const body=JSON.parse(raw);
    if(!body||typeof body!=='object'||Array.isArray(body)||!['reveal','reset'].includes(body.action)||Object.keys(body).some(key=>!['action','id','revision','password'].includes(key))||!Number.isSafeInteger(body.id)||body.id<1)throw new AccountPasswordError('Thông tin tài khoản không hợp lệ.');
    client=await ownerDatabase.connect();await client.query('BEGIN');
    if(body.action==='reveal'){
      const data=await revealAccountPassword(client,actor,body.id);await client.query('COMMIT');
      return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
    }
    const data=await resetAccountPassword(client,actor,body.id,String(body.revision||''),body.password);await client.query('COMMIT');
    const response=NextResponse.json({status:'success',data:{id:data.id,changed_at:data.changed_at}},{headers:{'Cache-Control':'private, no-store'}});
    if(body.id===actor.id)response.cookies.set(SESSION_COOKIE,signSession(actor.id,undefined,Date.now(),data.password_version),{httpOnly:true,sameSite:'strict',secure:request.nextUrl.protocol==='https:',path:'/',maxAge:SESSION_SECONDS});
    return response;
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});
    if(error instanceof SyntaxError)return NextResponse.json({status:'error',message:'Thông tin tài khoản không hợp lệ.'},{status:400});
    return error instanceof AccountPasswordError?NextResponse.json({status:'error',message:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}}):failureResponse('Không thực hiện được thao tác mật khẩu.',error);
  }finally{client?.release();}
});
