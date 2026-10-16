import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
export const runtime='nodejs';
export const GET=withAccessRequest(async(request:NextRequest)=>{
  const raw=request.nextUrl.searchParams.get('after')||'0';if(!/^\d{1,16}$/.test(raw))return NextResponse.json({status:'error',message:'Mốc thông báo không hợp lệ.'},{status:400});
  const rows=(await himotoPool.query(`SELECT e.id,e.order_id,e.mode,e.status,e.amount,e.received_at,o.contract_number AS code,e.message
    FROM himoto.management_sepay_events e LEFT JOIN himoto.orders o ON o.id=e.order_id WHERE e.id>$1 ORDER BY e.id DESC LIMIT 30`,[raw])).rows;
  return NextResponse.json({status:'success',data:rows},{headers:{'Cache-Control':'no-store'}});
});
