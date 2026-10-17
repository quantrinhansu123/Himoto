import { NextRequest,NextResponse } from 'next/server';
import { validIntegrationWorker,integrationSchedulerNonce,claimIntegrationSchedulerNonce } from '@/lib/server/integration-worker-auth';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { syncGpsAccounts } from '@/lib/server/gps-sync';
import { dispatchContractNotifications } from '@/lib/server/contract-notifications';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:NextRequest) {
  const authorization=request.headers.get('authorization');
  if(!validIntegrationWorker(authorization))return NextResponse.json({status:'error'},{status:401});
  try{const nonce=integrationSchedulerNonce(authorization!);if(nonce&&!await claimIntegrationSchedulerNonce(ownerDatabase,nonce))return NextResponse.json({status:'error'},{status:409});
    const [gps,telegram]=await Promise.all([syncGpsAccounts(),dispatchContractNotifications(undefined,2)]);return NextResponse.json({status:'success',gps,telegram},{headers:{'Cache-Control':'no-store'}});}
  catch{return NextResponse.json({status:'error',message:'Đồng bộ chưa hoàn tất.'},{status:503});}
}
