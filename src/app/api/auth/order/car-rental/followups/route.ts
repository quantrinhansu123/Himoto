import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { patchCollectionFollowup,readCollectionFollowups } from '@/lib/server/collection-followups';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime='nodejs';
export const GET=withAccessRequest(async(request:NextRequest)=>{
  const values=(request.nextUrl.searchParams.get('ids')||'').split(',');
  if(values.length>200||values.some(id=>!/^[1-9]\d{0,14}$/.test(id)||!Number.isSafeInteger(Number(id))))return NextResponse.json({message:'Chọn từ 1 đến 200 hợp đồng hợp lệ.'},{status:400});
  try{return NextResponse.json({data:await readCollectionFollowups(himotoPool,[...new Set(values.map(Number))])},{headers:{'Cache-Control':'private, no-store'}});}
  catch(error){return failureResponse('Không tải được ghi chú hợp đồng.',error);}
});
export const PATCH=withAccessRequest(patchCollectionFollowup);
