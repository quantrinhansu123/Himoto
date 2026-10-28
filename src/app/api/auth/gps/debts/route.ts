import { after,NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { dataAccess } from '@/lib/server/access-context';
import { patchCollectionFollowup } from '@/lib/server/collection-followups';
import { collectionReportMessages,readCollectionReport } from '@/lib/server/collection-report';
import { queueReportTelegram,deliverReportTelegram } from '@/lib/server/report-telegram';
import { failureResponse } from '@/lib/server/public-failure';
import { vietnamDate } from '@/lib/management/duty-roster';
import type {PoolClient} from 'pg';

export const runtime='nodejs';
export const maxDuration=300;
export const GET=withAccessRequest(async(request:NextRequest)=>{
  const store=request.nextUrl.searchParams.get('store')||'all';
  if(store!=='all'&&!/^[1-9]\d{0,14}$/.test(store))return NextResponse.json({message:'Cơ sở không hợp lệ.'},{status:400});
  let client:PoolClient|undefined;
  try{client=await himotoPool.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL statement_timeout='20s'");
    const data=await readCollectionReport(client,store);
    const storeName=store==='all'?'Toàn hệ thống':String((await client.query('SELECT store_name FROM himoto.stores WHERE id=$1',[store])).rows[0]?.store_name||'PGD');
    const preview=collectionReportMessages(data.rows,storeName);
    const keys=preview.messages.map((_,i)=>`debt:${store}:${vietnamDate()}:${preview.hash}:${i}`);
    const deliveries=store==='all'?[]:(await client.query('SELECT status,message_id FROM himoto.management_report_deliveries WHERE delivery_key=ANY($1::text[])',[keys])).rows;
    await client.query('COMMIT');return NextResponse.json({data:{...data,...preview,deliveries}},{headers:{'Cache-Control':'no-store'}});
  }catch(e){await client?.query('ROLLBACK').catch(()=>{});return failureResponse('Không tải được báo cáo nợ chậm.',e);}finally{client?.release();}
});
export const PATCH=withAccessRequest(patchCollectionFollowup);
export const POST=withAccessRequest(async(request:NextRequest)=>{
  let client:PoolClient|undefined;
  try{const body=await request.json();if(!Number.isSafeInteger(body.store_id)||body.store_id<1||typeof body.hash!=='string'||!/^[a-f0-9]{64}$/.test(body.hash))return NextResponse.json({message:'Chọn PGD và xem trước báo cáo.'},{status:400});
    const actor=dataAccess.getStore()!;if(!actor.scope_all&&body.store_id!==actor.store_id)return NextResponse.json({message:'PGD ngoài phạm vi được phân công.'},{status:403});
    client=await himotoPool.connect();await client.query('BEGIN');const store=(await client.query('SELECT store_name FROM himoto.stores WHERE id=$1',[body.store_id])).rows[0];if(!store)throw Error('PGD ngoài phạm vi.');
    const report=await readCollectionReport(client,String(body.store_id)),preview=collectionReportMessages(report.rows,store.store_name);
    if(preview.hash!==body.hash){await client.query('ROLLBACK');return NextResponse.json({message:'Báo cáo đã thay đổi. Làm mới và kiểm tra trước khi gửi.'},{status:409});}
    const keys=preview.messages.map((_,i)=>`debt:${body.store_id}:${vietnamDate()}:${preview.hash}:${i}`);
    for(const [i,text] of preview.messages.entries())await queueReportTelegram(client,keys[i],body.store_id,text,'store');
    await client.query('COMMIT');after(async()=>{for(const key of keys)await deliverReportTelegram(key);});
    return NextResponse.json({data:{queued:keys.length}});
  }catch(e){await client?.query('ROLLBACK').catch(()=>{});return failureResponse('Chưa gửi được báo cáo nợ chậm.',e);}finally{client?.release();}
});
