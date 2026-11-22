import { after,NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { dataAccess } from '@/lib/server/access-context';
import { CollectionFollowupError,patchCollectionFollowup } from '@/lib/server/collection-followups';
import { queueCollectionReport,readCollectionReportView } from '@/lib/server/collection-report';
import { deliverReportTelegram } from '@/lib/server/report-telegram';
import { failureResponse } from '@/lib/server/public-failure';
import type {PoolClient} from 'pg';

export const runtime='nodejs';
export const maxDuration=300;
export const GET=withAccessRequest(async(request:NextRequest)=>{
  const store=request.nextUrl.searchParams.get('store')||'all';
  if(store!=='all'&&!/^[1-9]\d{0,14}$/.test(store))return NextResponse.json({message:'Cơ sở không hợp lệ.'},{status:400});
  let client:PoolClient|undefined;
  try{client=await himotoPool.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL statement_timeout='20s'");
    const data=await readCollectionReportView(client,store);
    await client.query('COMMIT');return NextResponse.json({data},{headers:{'Cache-Control':'no-store'}});
  }catch(e){await client?.query('ROLLBACK').catch(()=>{});return failureResponse('Không tải được báo cáo nợ chậm.',e);}finally{client?.release();}
});
export const PATCH=withAccessRequest(patchCollectionFollowup);
export const POST=withAccessRequest(async(request:NextRequest)=>{
  let client:PoolClient|undefined;
  try{const body=await request.json();if(!Number.isSafeInteger(body.store_id)||body.store_id<1||typeof body.hash!=='string'||!/^[a-f0-9]{64}$/.test(body.hash))return NextResponse.json({message:'Chọn PGD và xem trước báo cáo.'},{status:400});
    const actor=dataAccess.getStore()!;if(!actor.scope_all&&body.store_id!==actor.store_id)return NextResponse.json({message:'PGD ngoài phạm vi được phân công.'},{status:403});
    client=await himotoPool.connect();await client.query('BEGIN');
    const keys=await queueCollectionReport(client,body.store_id,body.hash);
    await client.query('COMMIT');after(async()=>{for(const key of keys)await deliverReportTelegram(key);});
    return NextResponse.json({data:{queued:keys.length}});
  }catch(e){
    await client?.query('ROLLBACK').catch(()=>{});
    if(e instanceof CollectionFollowupError)return NextResponse.json({message:e.message},{status:e.status});
    return failureResponse('Chưa gửi được báo cáo nợ chậm.',e);
  }finally{client?.release();}
});
