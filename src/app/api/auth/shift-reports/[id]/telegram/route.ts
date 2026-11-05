import {after,NextRequest,NextResponse} from 'next/server';
import {withAccessRequest} from '@/lib/server/access-request';
import {himotoPool} from '@/lib/server/himoto-database';
import {hasPermission} from '@/lib/management/permissions';
import {dataAccess} from '@/lib/server/access-context';
import {deliverReportTelegram} from '@/lib/server/report-telegram';
import {failureResponse} from '@/lib/server/public-failure';
import {readShiftTelegram,retryShiftTelegram} from '@/lib/server/shift-telegram-domain';
import {ShiftRequestError} from '@/lib/server/shift-report-requests';
export const runtime='nodejs';
export const maxDuration=60;
type Context={params:Promise<{id:string}>};
export const GET=withAccessRequest(async(_request:NextRequest,context:Context)=>{
  const {id}=await context.params;if(!/^[1-9]\d{0,14}$/.test(id))return NextResponse.json({message:'Báo cáo không hợp lệ.'},{status:400});
  try{const data=await readShiftTelegram(himotoPool,id);return NextResponse.json({data},{headers:{'Cache-Control':'no-store'}});}catch(e){return failureResponse('Chưa đọc được trạng thái Telegram.',e);}
});
export const POST=withAccessRequest(async(_request:NextRequest,context:Context)=>{
  if(!hasPermission(dataAccess.getStore(),'contracts.draft')&&!hasPermission(dataAccess.getStore(),'finance.write'))return NextResponse.json({message:'Không có quyền gửi báo cáo.'},{status:403});
  const {id}=await context.params;if(!/^[1-9]\d{0,14}$/.test(id))return NextResponse.json({message:'Báo cáo không hợp lệ.'},{status:400});
  try{const result=await retryShiftTelegram(himotoPool,id);if(result.deliveryKey)after(()=>deliverReportTelegram(result.deliveryKey!));return NextResponse.json({data:{status:result.status}});
  }catch(e){return e instanceof ShiftRequestError?NextResponse.json({message:e.message},{status:e.status}):failureResponse('Chưa gửi được báo cáo.',e);}
});
