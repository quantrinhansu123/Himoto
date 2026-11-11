import { after,NextRequest,NextResponse } from 'next/server';
import { validIntegrationWorker,integrationSchedulerNonce,claimIntegrationSchedulerNonce } from '@/lib/server/integration-worker-auth';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { dispatchContractNotifications } from '@/lib/server/contract-notifications';
import { TELEGRAM_DISPATCH_BUDGET_MS } from '@/lib/server/telegram-delivery';
import { runIntegrationJob } from '@/lib/server/integration-jobs';
import { dispatchMobilePush } from '@/lib/server/mobile-push';
import { failureResponse } from '@/lib/server/public-failure';
export const runtime='nodejs';
export const maxDuration=300;
export async function POST(request:NextRequest) {
  const deadline=Date.now()+TELEGRAM_DISPATCH_BUDGET_MS;
  const authorization=request.headers.get('authorization');
  if(!validIntegrationWorker(authorization))return NextResponse.json({status:'error'},{status:401});
  try{const nonce=integrationSchedulerNonce(authorization!);if(nonce&&!await claimIntegrationSchedulerNonce(ownerDatabase,nonce))return NextResponse.json({status:'error'},{status:409});
    // This legacy endpoint remains compatible with the five-second scheduler
    // and installed workers. GPS has independent endpoints and schedules.
    after(async()=>{const results=await Promise.allSettled([
      runIntegrationJob('telegram',270_000,()=>dispatchContractNotifications(undefined,2,undefined,undefined,undefined,deadline)),
      runIntegrationJob('push',75_000,()=>dispatchMobilePush(15_000))]);
      if(results[0].status==='rejected')console.error('Telegram background dispatch failed.');
      if(results[1].status==='rejected')console.error('Mobile push dispatch failed.');});
    return NextResponse.json({status:'success',gps:{separate:true},telegram:{queued:true}},{headers:{'Cache-Control':'no-store'}});}
  catch(error){return failureResponse('Đồng bộ chưa hoàn tất.',error,503);}
}
