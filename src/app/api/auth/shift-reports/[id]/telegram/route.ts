import {after,NextRequest,NextResponse} from 'next/server';
import {withAccessRequest} from '@/lib/server/access-request';
import {himotoPool} from '@/lib/server/himoto-database';
import {hasPermission} from '@/lib/management/permissions';
import {dataAccess} from '@/lib/server/access-context';
import {deliverReportTelegram} from '@/lib/server/report-telegram';
import {failureResponse} from '@/lib/server/public-failure';
import {readShiftTelegram,retryShiftTelegram,shiftTelegramKey} from '@/lib/server/shift-telegram-domain';
import {ShiftRequestError} from '@/lib/server/shift-report-requests';
export const runtime='nodejs';
export const maxDuration=300;
type Context={params:Promise<{id:string}>};
export const GET=withAccessRequest(async(request:NextRequest,context:Context)=>{
  const {id}=await context.params;if(!/^[1-9]\d{0,14}$/.test(id))return NextResponse.json({message:'Báo cáo không hợp lệ.'},{status:400});
  try{const stage=request.nextUrl.searchParams.get('stage')||'pgd',key=shiftTelegramKey(id,stage),data=await readShiftTelegram(himotoPool,id,stage);if(data?.status==='pending')after(()=>deliverReportTelegram(key));return NextResponse.json({data},{headers:{'Cache-Control':'no-store'}});}catch(e){return failureResponse('Chưa đọc được trạng thái Telegram.',e);}
});
export const POST=withAccessRequest(async(request:NextRequest,context:Context)=>{
  if(request.nextUrl.searchParams.get('stage')==='audit'?!hasPermission(dataAccess.getStore(),'shift.review'):!hasPermission(dataAccess.getStore(),'contracts.draft')&&!hasPermission(dataAccess.getStore(),'finance.write'))return NextResponse.json({message:'Không có quyền gửi báo cáo.'},{status:403});
  const {id}=await context.params;if(!/^[1-9]\d{0,14}$/.test(id))return NextResponse.json({message:'Báo cáo không hợp lệ.'},{status:400});
  try{const result=await retryShiftTelegram(himotoPool,id,request.nextUrl.searchParams.get('stage')||'pgd');if(result.deliveryKey)after(()=>deliverReportTelegram(result.deliveryKey!));return NextResponse.json({data:{status:result.status}});
  }catch(e){return e instanceof ShiftRequestError?NextResponse.json({message:e.message},{status:e.status}):failureResponse('Chưa gửi được báo cáo.',e);}
});
