import {NextRequest,NextResponse} from 'next/server';
import {withAccessRequest} from '@/lib/server/access-request';
import {protectDatabaseRequest} from '@/lib/server/management-session';
import {himotoPool} from '@/lib/server/himoto-database';
import {rentalRevenue,RentalRevenueError} from '@/lib/server/rental-revenue';
import {failureResponse} from '@/lib/server/public-failure';
async function GETHandler(request:NextRequest){
  const denied=await protectDatabaseRequest(request);if(denied)return denied;
  const query=request.nextUrl.searchParams;
  try{return NextResponse.json({status:'success',data:await rentalRevenue(himotoPool,query.get('from')||'',query.get('to')||'',query.has('store_id')?Number(query.get('store_id')):undefined)},{headers:{'Cache-Control':'no-store'}});}
  catch(error){return error instanceof RentalRevenueError?NextResponse.json({status:'error',message:error.message},{status:400}):failureResponse('Không tải được doanh thu thuê xe.',error);}
}
export const GET=withAccessRequest(GETHandler);
