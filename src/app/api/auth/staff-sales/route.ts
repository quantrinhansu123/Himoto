import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest,NextResponse } from 'next/server';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { himotoPool } from '@/lib/server/himoto-database';
import { staffSales,StaffSalesError } from '@/lib/server/staff-sales';
import { failureResponse } from '@/lib/server/public-failure';
async function GETHandler(request:NextRequest) {
  const denied=await protectDatabaseRequest(request);if(denied)return denied;
  const query=request.nextUrl.searchParams;
  try {const data=await staffSales(himotoPool,query.get('from') || '',query.get('to') || '',query.has('store_id') ? Number(query.get('store_id')) : undefined);return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'no-store'}});}
  catch(error){return error instanceof StaffSalesError ? NextResponse.json({status:'error',message:error.message},{status:error.status}) : failureResponse('Không tải được doanh số nhân viên.',error);}
}

export const GET = withAccessRequest(GETHandler);
