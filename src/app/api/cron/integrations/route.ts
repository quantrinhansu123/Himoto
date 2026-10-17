import { NextRequest,NextResponse } from 'next/server';
import { validIntegrationWorker } from '@/lib/server/integration-worker-auth';
import { syncGpsAccounts } from '@/lib/server/gps-sync';
import { dispatchContractNotifications } from '@/lib/server/contract-notifications';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:NextRequest) {
  if(!validIntegrationWorker(request.headers.get('authorization')))return NextResponse.json({status:'error'},{status:401});
  try{const [gps,telegram]=await Promise.all([syncGpsAccounts(),dispatchContractNotifications(undefined,2)]);return NextResponse.json({status:'success',gps,telegram},{headers:{'Cache-Control':'no-store'}});}
  catch{return NextResponse.json({status:'error',message:'Đồng bộ chưa hoàn tất.'},{status:503});}
}
