import { after,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { syncGpsAccounts } from '@/lib/server/gps-sync';
import { syncGpsEventHistory } from '@/lib/server/gps-history-sync';
import { failureResponse } from '@/lib/server/public-failure';
export const runtime='nodejs';
export const maxDuration=60;
export const POST=withAccessRequest(async()=>{
  try{const result=await syncGpsAccounts();if(result.attempted>0&&result.succeeded===0)throw new Error(`Không tài khoản GPS nào đồng bộ thành công (${result.attempted} tài khoản).`);
    after(async()=>{try{await syncGpsEventHistory();}catch(error){console.error('GPS history sync failed.',error instanceof Error?error.message:error);}});
    return NextResponse.json({status:'success'},{headers:{'Cache-Control':'no-store'}});}
  catch(error){return failureResponse('Chưa đồng bộ được GPS. Trạng thái gần nhất được giữ nguyên.',error,503);}
});
