import {deliverReportTelegram} from '@/lib/server/report-telegram';
import { after,NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { himotoPool } from '@/lib/server/himoto-database';
import { hasPermission } from '@/lib/management/permissions';
import { readShiftAuditSnapshot,saveShiftAudit } from '@/lib/server/shift-audit-domain';
import { ShiftRequestError,shiftRequestId } from '@/lib/server/shift-report-requests';
import { failureResponse } from '@/lib/server/public-failure';
export const runtime='nodejs';
export const maxDuration=300;
type Context={params:Promise<{id:string}>};
export const GET=withAccessRequest(async(_request:NextRequest,context:Context)=>{
  const {id}=await context.params;
  if(!/^[1-9]\d{0,14}$/.test(id))return NextResponse.json({message:'Báo cáo không hợp lệ.'},{status:400});
  const client=await himotoPool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshot=await readShiftAuditSnapshot(client,id);await client.query('COMMIT');
    return NextResponse.json({data:snapshot},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){await client.query('ROLLBACK').catch(()=>{});return failureResponse('Không lấy được số liệu đối soát từ app.',error);}finally{client.release();}
});
export const POST=withAccessRequest(async(request:NextRequest,context:Context)=>{
  const actor=dataAccess.getStore()!;
  if(!hasPermission(actor,'shift.review'))return NextResponse.json({message:'Chỉ tài khoản được cấp quyền KTNB mới được đối soát.'},{status:403});
  const {id}=await context.params;let client;
  try{
    if(!/^[1-9]\d{0,14}$/.test(id))throw Error('Báo cáo không hợp lệ.');
    const raw=await request.json(),key=shiftRequestId(request.headers);if(!key)throw Error('Thiếu mã thao tác đối soát.');
    client=await himotoPool.connect();await client.query('BEGIN');
    const data=await saveShiftAudit(client,actor,id,raw,key);
    await client.query('COMMIT');if(raw.status==='confirmed')after(()=>deliverReportTelegram(`shift-audit:${id}`));return NextResponse.json({data});
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});return error instanceof ShiftRequestError?NextResponse.json({message:error.message},{status:error.status}):failureResponse('Không lưu được đối soát. Giữ form và thử lại.',error);}finally{client?.release();}
});
