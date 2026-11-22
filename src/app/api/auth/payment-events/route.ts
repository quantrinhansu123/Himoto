import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { failureResponse } from '@/lib/server/public-failure';
import { readSePayReceiptEvents } from '@/lib/server/sepay-events';
export const runtime='nodejs';
export const GET=withAccessRequest(async(request:NextRequest)=>{
  const raw=request.nextUrl.searchParams.get('after')||'0';if(!/^\d{1,16}$/.test(raw))return NextResponse.json({status:'error',message:'Mốc thông báo không hợp lệ.'},{status:400});
  try{
    const rows=await readSePayReceiptEvents(himotoPool,raw);
    return NextResponse.json({status:'success',data:rows},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failureResponse('Không tải được thông báo thanh toán.',error);}
});
