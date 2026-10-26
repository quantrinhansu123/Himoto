import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { canRecoverAccountPasswords } from '@/lib/management/permissions';
import { AccountPasswordError,revealAccountPassword } from '@/lib/server/account-passwords';
import { failureResponse } from '@/lib/server/public-failure';
export const runtime='nodejs';
export const POST=withAccessRequest(async(request:NextRequest)=>{
  let client;
  try{
    const actor=dataAccess.getStore()!;
    if(!canRecoverAccountPasswords(actor))throw new AccountPasswordError('Chỉ tài khoản quanlyvanhanh và quantri được xem mật khẩu.',403);
    const raw=await request.text();if(raw.length>4096)throw new AccountPasswordError('Thông tin mật khẩu quá dài.');
    const body=JSON.parse(raw);
    if(body?.action==='reset')throw new AccountPasswordError('Đã bỏ chức năng đặt lại mật khẩu. Nhân viên tự đổi mật khẩu của mình.',403);
    const id=typeof body?.id==='number'?body.id:typeof body?.id==='string'&&/^\d+$/.test(body.id)?Number(body.id):NaN;
    if(!body||typeof body!=='object'||Array.isArray(body)||body.action!=='reveal'||Object.keys(body).some(key=>!['action','id'].includes(key))||!Number.isSafeInteger(id)||id<1)throw new AccountPasswordError('Thông tin tài khoản không hợp lệ.');
    client=await ownerDatabase.connect();await client.query('BEGIN');
    const data=await revealAccountPassword(client,actor,id);await client.query('COMMIT');
    return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});
    if(error instanceof SyntaxError)return NextResponse.json({status:'error',message:'Thông tin tài khoản không hợp lệ.'},{status:400});
    return error instanceof AccountPasswordError?NextResponse.json({status:'error',message:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}}):failureResponse('Không thực hiện được thao tác mật khẩu.',error);
  }finally{client?.release();}
});
