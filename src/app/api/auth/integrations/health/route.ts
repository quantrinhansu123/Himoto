import {NextResponse} from 'next/server';
import {withAccessRequest} from '@/lib/server/access-request';
import {dataAccess} from '@/lib/server/access-context';
import {isAdminAccount} from '@/lib/management/permissions';
import {readIntegrationHealth} from '@/lib/server/integration-health';
import {failureResponse} from '@/lib/server/public-failure';
export const runtime='nodejs';
export const maxDuration=60;
export const GET=withAccessRequest(async()=>{
  if(!isAdminAccount(dataAccess.getStore()))return NextResponse.json({status:'error',message:'Chỉ quản trị được xem tình trạng tích hợp.'},{status:403});
  try{return NextResponse.json({status:'success',data:await readIntegrationHealth()},{headers:{'Cache-Control':'private, no-store'}});}
  catch(error){return failureResponse('Chưa đọc được tình trạng tích hợp.',error);}
});
