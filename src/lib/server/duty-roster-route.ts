import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from './himoto-database';
import { protectDatabaseRequest, SESSION_COOKIE, userFromSession } from './management-session';
import { deleteDuty, DutyError, listDuties, parseDutyInput, saveDuty } from './duty-roster';
import { vietnamDate } from '@/lib/management/duty-roster';

export async function handleDutyRequest(request:NextRequest,method:'GET'|'POST'|'PATCH'|'DELETE',rawId?:string) {
  const denied=await protectDatabaseRequest(request);if(denied)return denied;
  let client;
  try {
    const id=rawId===undefined?undefined:Number(rawId);
    if(rawId!==undefined&&(!/^\d+$/.test(rawId)||!Number.isSafeInteger(id)||Number(id)<=0))throw new DutyError('Mã ca trực không hợp lệ.');
    const user=method==='GET'?null:await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);
    if(method!=='GET'&&!user)return NextResponse.json({status:'error',message:'Phiên đăng nhập đã hết hạn.'},{status:401});
    const raw=method==='GET'?null:await request.json();
    const input=method==='POST'||method==='PATCH'?parseDutyInput(raw,method==='PATCH'):null;
    if(method==='DELETE'&&(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>key!=='revision')||typeof raw.revision!=='string'))throw new DutyError('Phiên bản ca trực không hợp lệ.');
    client=await himotoPool.connect();await client.query(method==='GET'?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
    const store=request.nextUrl.searchParams.get('store_id');
    if(method==='GET'&&store!==null&&!/^[1-9]\d*$/.test(store))throw new DutyError('Cơ sở không hợp lệ.');
    const data=method==='GET'?await listDuties(client,request.nextUrl.searchParams.get('week')||vietnamDate(),store===null?undefined:Number(store))
      :method==='DELETE'?await deleteDuty(client,id!,raw.revision,user!.id):await saveDuty(client,user!.id,input!,id);
    await client.query('COMMIT');
    return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    if(client)await client.query('ROLLBACK').catch(()=>{});
    if(error instanceof DutyError)return NextResponse.json({status:'error',message:error.message},{status:error.status});
    if(error instanceof SyntaxError)return NextResponse.json({status:'error',message:'Thông tin ca trực không hợp lệ.'},{status:400});
    console.error('Duty roster request failed:',error instanceof Error?error.name:'Unknown error');
    return NextResponse.json({status:'error',message:'Chưa xác nhận được lịch trực. Làm mới để kiểm tra trước khi thử lại.'},{status:500});
  } finally {client?.release();}
}
