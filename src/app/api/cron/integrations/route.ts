import { after,NextRequest,NextResponse } from 'next/server';
import { validIntegrationWorker,integrationSchedulerNonce,claimIntegrationSchedulerNonce } from '@/lib/server/integration-worker-auth';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { syncGpsAccounts } from '@/lib/server/gps-sync';
import { dispatchContractNotifications } from '@/lib/server/contract-notifications';
import { TELEGRAM_DISPATCH_BUDGET_MS } from '@/lib/server/telegram-delivery';
import { syncGpsEventHistory } from '@/lib/server/gps-history-sync';
export const runtime='nodejs';
export const maxDuration=300;
export async function POST(request:NextRequest) {
  const deadline=Date.now()+TELEGRAM_DISPATCH_BUDGET_MS;
  const authorization=request.headers.get('authorization');
  if(!validIntegrationWorker(authorization))return NextResponse.json({status:'error'},{status:401});
  try{const nonce=integrationSchedulerNonce(authorization!);if(nonce&&!await claimIntegrationSchedulerNonce(ownerDatabase,nonce))return NextResponse.json({status:'error'},{status:409});
    const gps=await syncGpsAccounts();
    // The scheduler has a 55s HTTP timeout. Keep slow media uploads in the function's after-response work.
    after(async()=>{const results=await Promise.allSettled([dispatchContractNotifications(undefined,2,undefined,undefined,undefined,deadline),syncGpsEventHistory()]);
      if(results[0].status==='rejected')console.error('Telegram background dispatch failed.');
      if(results[1].status==='rejected')console.error('GPS history sync failed.');});
    return NextResponse.json({status:'success',gps,telegram:{queued:true}},{headers:{'Cache-Control':'no-store'}});}
  catch{return NextResponse.json({status:'error',message:'Đồng bộ chưa hoàn tất.'},{status:503});}
}
