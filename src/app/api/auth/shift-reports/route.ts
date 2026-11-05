import { after,NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { dataAccess } from '@/lib/server/access-context';
import { ShiftRequestError,shiftRequestId } from '@/lib/server/shift-report-requests';
import { listShiftReports,saveShiftReport } from '@/lib/server/shift-report-domain';
import { deliverReportTelegram } from '@/lib/server/report-telegram';
import { failureResponse } from '@/lib/server/public-failure';
import { hasPermission } from '@/lib/management/permissions';
export const runtime='nodejs';
export const maxDuration=300;
export const GET=withAccessRequest(async(request:NextRequest)=>{
  try{return NextResponse.json({data:await listShiftReports(himotoPool,request.nextUrl.searchParams.get('store_id'),request.nextUrl.searchParams.get('date'))},{headers:{'Cache-Control':'no-store'}});}
  catch(error){return error instanceof ShiftRequestError?NextResponse.json({message:error.message},{status:error.status}):failureResponse('Không tải được báo cáo cuối ca.',error);}
});
export const POST=withAccessRequest(async(request:NextRequest)=>{
  const user=dataAccess.getStore();
  if(!hasPermission(user,'contracts.draft')&&!hasPermission(user,'finance.write'))return NextResponse.json({message:'Không có quyền lập báo cáo.'},{status:403});
  let client;
  try{
    const raw=await request.json(),actor=dataAccess.getStore()!,requestId=shiftRequestId(request.headers);
    client=await himotoPool.connect();await client.query('BEGIN');
    const saved=await saveShiftReport(client,actor,raw,requestId);await client.query('COMMIT');
    if(raw.status==='submitted'&&raw.payload?.ownership_report)after(()=>deliverReportTelegram(`shift:${saved.id}`));
    return NextResponse.json({data:saved});
  }catch(error){
    if(client)await client.query('ROLLBACK').catch(()=>{});
    if(error instanceof ShiftRequestError)return NextResponse.json({message:error.message},{status:error.status});
    const code=(error as {code?:string}).code;
    if(code==='23505')return failureResponse('PGD đã có báo cáo ngày này. Mở báo cáo trong danh sách.',error);
    if(code)return failureResponse('Chưa lưu được báo cáo.',error);
    return NextResponse.json({message:error instanceof Error&&error.message?error.message:'Thông tin không hợp lệ.'},{status:400});
  }finally{client?.release();}
});
