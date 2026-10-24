import { NextRequest,NextResponse } from 'next/server';
import { canViewOwnedFleetRevenue } from '@/lib/management/permissions';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { ownedFleetRevenue } from '@/lib/server/owned-fleet-revenue';
import { RentalReportError } from '@/lib/server/rental-reports';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime='nodejs';
async function GETHandler(request:NextRequest) {
  // No role/admin bypass and no caller-supplied user_id. Global visibility is
  // confined to this individual read-only report, never the normal workspace.
  if(!canViewOwnedFleetRevenue(dataAccess.getStore()))return NextResponse.json({status:'error',message:'Tài khoản không có quyền xem báo cáo đội xe theo cơ sở.'},{status:403,headers:{'Cache-Control':'private, no-store'}});
  const client=await ownerDatabase.connect();
  try{
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='20s'");
    const data=await ownedFleetRevenue(client,request.nextUrl.searchParams);
    await client.query('COMMIT');
    return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    await client.query('ROLLBACK').catch(()=>{});
    return error instanceof RentalReportError?NextResponse.json({status:'error',message:error.message},{status:400,headers:{'Cache-Control':'private, no-store'}}):failureResponse('Không tải được doanh thu đội xe theo cơ sở.',error);
  }finally{client.release();}
}
export const GET=withAccessRequest(GETHandler);
