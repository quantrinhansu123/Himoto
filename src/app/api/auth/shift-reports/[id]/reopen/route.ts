import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { himotoPool } from '@/lib/server/himoto-database';
import { ShiftRequestError } from '@/lib/server/shift-report-requests';
import { queueShiftReopen,readShiftReopen,runShiftReopen } from '@/lib/server/shift-report-reopen';
import { listShiftReports } from '@/lib/server/shift-report-domain';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime='nodejs';
export const maxDuration=120;
type Context={params:Promise<{id:string}>};
const headers={'Cache-Control':'private, no-store'};
async function handle(request:NextRequest,context:Context) {
  const rawId=(await context.params).id;
  if(!/^[1-9]\d{0,14}$/.test(rawId))return NextResponse.json({message:'Chọn đúng báo cáo Hết ca.'},{status:400,headers});
  const id=Number(rawId),actor=dataAccess.getStore()!;
  try {
    if(request.method==='POST') {
      const body=await request.json();
      const client=await himotoPool.connect();
      let key:string|null;
      try{
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout='5s'");
        key=await queueShiftReopen(client,actor,id,body);
        await client.query('COMMIT');
      } catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
      finally{client.release();}
      if(key)await runShiftReopen(id,key);
    }
    const data=await readShiftReopen(himotoPool,actor,id);
    const report=data.status==='draft'?(await listShiftReports(himotoPool,null,null,id))[0]:undefined;
    return NextResponse.json({data:{...data,...(report?{report}:{})}},{headers});
  }catch(error){
    if(error instanceof ShiftRequestError)return NextResponse.json({message:error.message},{status:error.status,headers});
    if(error instanceof SyntaxError)return NextResponse.json({message:'Thông tin mở lại báo cáo không hợp lệ.'},{status:400,headers});
    return failureResponse('Chưa xác nhận được việc mở lại báo cáo. Kiểm tra tiến độ trước khi thử lại.',error);
  }
}
export const GET=withAccessRequest(handle);
export const POST=withAccessRequest(handle);
