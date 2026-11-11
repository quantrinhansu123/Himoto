import { NextRequest,NextResponse } from 'next/server';
import { validIntegrationWorker,integrationSchedulerNonce,claimIntegrationSchedulerNonce } from '@/lib/server/integration-worker-auth';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { syncGpsAccounts } from '@/lib/server/gps-sync';
import { failureResponse } from '@/lib/server/public-failure';
export const runtime='nodejs';
export const maxDuration=90;
export async function POST(request:NextRequest){
  const authorization=request.headers.get('authorization');
  if(!validIntegrationWorker(authorization,Date.now(),'/api/cron/gps-live'))return NextResponse.json({status:'error'},{status:401});
  try{const nonce=integrationSchedulerNonce(authorization!);if(nonce&&!await claimIntegrationSchedulerNonce(ownerDatabase,nonce))return NextResponse.json({status:'error'},{status:409});
    return NextResponse.json({status:'success',gps:await syncGpsAccounts()},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failureResponse('Đồng bộ GPS chưa hoàn tất.',error,503);}
}
