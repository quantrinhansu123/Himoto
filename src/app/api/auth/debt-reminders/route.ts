import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { himotoPool } from '@/lib/server/himoto-database';
import { canSendDebtReminder } from '@/lib/management/permissions';
import { DebtReminderError,listDebtReminders,sendDebtReminder } from '@/lib/server/debt-reminders';
export const runtime='nodejs';
export const maxDuration=30;
const failure=(error:unknown)=>NextResponse.json({status:'error',message:error instanceof DebtReminderError?error.message:'Không xử lý được yêu cầu. Kiểm tra lịch sử nhắc nợ trước khi gửi lại.'},{status:error instanceof DebtReminderError?error.status:500});
export const GET=withAccessRequest(async(request:NextRequest)=>{
  try{const page=request.nextUrl.searchParams.get('page')||'1';if(!/^[1-9]\d*$/.test(page))throw new DebtReminderError('Trang không hợp lệ.');
    return NextResponse.json({status:'success',data:await listDebtReminders(himotoPool,request.nextUrl.searchParams.get('store')||'all',Number(page))},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
});
export const POST=withAccessRequest(async(request:NextRequest)=>{
  try {
    const user=dataAccess.getStore();if(!canSendDebtReminder(user))throw new DebtReminderError('Tài khoản chưa có quyền gửi nhắc nợ.',403);
    const text=await request.text();if(Buffer.byteLength(text)>24576)throw new DebtReminderError('Nội dung quá lớn.',413);
    let raw;try{raw=JSON.parse(text);}catch{throw new DebtReminderError('Thông tin nhắc nợ không hợp lệ.');}
    return NextResponse.json({status:'success',data:await sendDebtReminder(himotoPool,user!.id,raw)},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
});
