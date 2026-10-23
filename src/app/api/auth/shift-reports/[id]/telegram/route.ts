import {after,NextRequest,NextResponse} from 'next/server';
import {withAccessRequest} from '@/lib/server/access-request';
import {himotoPool} from '@/lib/server/himoto-database';
import {hasPermission} from '@/lib/management/permissions';
import {dataAccess} from '@/lib/server/access-context';
import {deliverReportTelegram} from '@/lib/server/report-telegram';
import {failureResponse} from '@/lib/server/public-failure';
export const runtime='nodejs';
export const maxDuration=60;
type Context={params:Promise<{id:string}>};
export const GET=withAccessRequest(async(_request:NextRequest,context:Context)=>{
  const {id}=await context.params;if(!/^[1-9]\d{0,14}$/.test(id))return NextResponse.json({message:'Báo cáo không hợp lệ.'},{status:400});
  try{const data=(await himotoPool.query("SELECT CASE WHEN status='sending' AND updated_at<now()-interval '3 minutes' THEN 'unknown' ELSE status END AS status,message_id,error_code FROM himoto.management_report_deliveries WHERE delivery_key=$1",[`shift:${id}`])).rows[0]||null;return NextResponse.json({data},{headers:{'Cache-Control':'no-store'}});}catch(e){return failureResponse('Chưa đọc được trạng thái Telegram.',e);}
});
export const POST=withAccessRequest(async(_request:NextRequest,context:Context)=>{
  if(!hasPermission(dataAccess.getStore(),'contracts.draft')&&!hasPermission(dataAccess.getStore(),'finance.write'))return NextResponse.json({message:'Không có quyền gửi báo cáo.'},{status:403});
  const {id}=await context.params;if(!/^[1-9]\d{0,14}$/.test(id))return NextResponse.json({message:'Báo cáo không hợp lệ.'},{status:400});
  try{const row=(await himotoPool.query("SELECT status FROM himoto.management_report_deliveries WHERE delivery_key=$1",[`shift:${id}`])).rows[0];
    if(!row)return NextResponse.json({message:'Báo cáo chưa chốt / chưa có tin Telegram.'},{status:404});
    if(row.status==='unknown'||row.status==='sending')return NextResponse.json({message:'Chưa rõ kết quả gửi. Kiểm tra nhóm Telegram trước; hệ thống không tự gửi trùng.'},{status:409});
    if(row.status!=='sent')after(()=>deliverReportTelegram(`shift:${id}`));return NextResponse.json({data:{status:row.status}});
  }catch(e){return failureResponse('Chưa gửi được báo cáo.',e);}
});
