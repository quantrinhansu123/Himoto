import { after,NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { dataAccess } from '@/lib/server/access-context';
import { parseCollectionFollowup } from '@/lib/management/collection-report';
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
export const PATCH=withAccessRequest(async(request:NextRequest)=>{
  let client:PoolClient|undefined;
  try{const input=parseCollectionFollowup(await request.json()),actor=dataAccess.getStore()!;client=await himotoPool.connect();
    await client.query('BEGIN');
    const order=(await client.query('SELECT id,store_id FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[input.order_id])).rows[0];
    if(!order){await client.query('ROLLBACK');return NextResponse.json({message:'Không tìm thấy hợp đồng trong phạm vi.'},{status:404});}
    if(!actor.scope_all&&Number(order.store_id)!==actor.store_id){await client.query('ROLLBACK');return NextResponse.json({message:'Hợp đồng ngoài PGD được phân công.'},{status:403});}
    const {order_id,revision,...snapshot}=input;
    const result=await client.query(`INSERT INTO himoto.management_collection_followups(order_id,store_id,contact_status,handling_status,customer_condition,notes,updated_by)
      SELECT $1,$2,$3,$4,$5,$6,$7 WHERE $8::integer=0
      ON CONFLICT(order_id) DO NOTHING RETURNING revision`,[order_id,order.store_id,snapshot.contact_status,snapshot.handling_status,snapshot.customer_condition,snapshot.notes,actor.id,revision]);
    const updated=result.rowCount?result:revision>0?await client.query(`UPDATE himoto.management_collection_followups SET contact_status=$3,handling_status=$4,customer_condition=$5,notes=$6,updated_by=$7,revision=revision+1,updated_at=now()
      WHERE order_id=$1 AND revision=$8 AND store_id=$2 RETURNING revision`,[order_id,order.store_id,snapshot.contact_status,snapshot.handling_status,snapshot.customer_condition,snapshot.notes,actor.id,revision]):result;
    if(!updated.rowCount){await client.query('ROLLBACK');return NextResponse.json({message:'Ghi chú đã thay đổi. Tải lại trước khi lưu.'},{status:409});}
    await client.query('INSERT INTO himoto.management_collection_history(order_id,store_id,snapshot,updated_by) VALUES($1,$2,$3,$4)',[order_id,order.store_id,snapshot,actor.id]);
    await client.query('COMMIT');return NextResponse.json({data:{revision:updated.rows[0].revision}});
  }catch(e){await client?.query('ROLLBACK').catch(()=>{});return failureResponse('Không lưu được tình trạng khách.',e);}finally{client?.release();}
});
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
