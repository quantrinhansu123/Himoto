import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { himotoPool } from '@/lib/server/himoto-database';
import { parseShiftAutofill,readShiftAutofill,ShiftAutofillError } from '@/lib/server/shift-autofill';
import { failureResponse } from '@/lib/server/public-failure';
export const runtime='nodejs';
export const GET=withAccessRequest(async(request:NextRequest)=>{
  let lastError:unknown;
  for(let attempt=0;attempt<2;attempt++) {
  let client;
  try {
    const input=parseShiftAutofill(request.nextUrl.searchParams),actor=dataAccess.getStore()!;
    if(!actor.scope_all&&actor.store_id!==input.store_id)throw new ShiftAutofillError('PGD ngoài phạm vi được phân công.',403);
    client=await himotoPool.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='15s'");
    const data=await readShiftAutofill(client,input);await client.query('COMMIT');
    return NextResponse.json({data},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    lastError=error;
    if(client)await client.query('ROLLBACK').catch(()=>{});
    const code=(error as {code?:string})?.code;
    // This endpoint only reads. A fresh transaction can safely retry transient
    // database contention without duplicating reports or any business writes.
    if(attempt===0&&['57014','55P03','40001','40P01','08006','08003'].includes(code||''))continue;
    if(error instanceof ShiftAutofillError)return NextResponse.json({message:error.message},{status:error.status});
    return failureResponse('Không lấy được dữ liệu từ DB. Các giá trị đang nhập được giữ nguyên.',error,503);
  }finally{client?.release();}
  }
  return failureResponse('Chưa tải được số liệu. Vui lòng thử lại.',lastError,503);
});
