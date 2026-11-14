import { NextRequest,NextResponse } from 'next/server';
import { validIntegrationWorker,integrationSchedulerNonce,claimIntegrationSchedulerNonce } from '@/lib/server/integration-worker-auth';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { syncGpsEventHistory } from '@/lib/server/gps-history-sync';
import { failureResponse } from '@/lib/server/public-failure';
export const runtime='nodejs';
export const maxDuration=45;
export async function POST(request:NextRequest){
  const authorization=request.headers.get('authorization');
  if(!validIntegrationWorker(authorization,Date.now(),'/api/cron/gps-history'))return NextResponse.json({status:'error'},{status:401});
  try{const nonce=integrationSchedulerNonce(authorization!);if(nonce&&!await claimIntegrationSchedulerNonce(ownerDatabase,nonce))return NextResponse.json({status:'error'},{status:409});
    return NextResponse.json({status:'success',history:await syncGpsEventHistory()},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failureResponse('Đọc bù GPS chưa hoàn tất.',error,503);}
}
