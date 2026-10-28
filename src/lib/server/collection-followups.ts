import 'server-only';
import { NextRequest,NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import { parseCollectionFollowup,type CollectionFollowup } from '@/lib/management/collection-report';
import { dataAccess } from './access-context';
import { himotoPool } from './himoto-database';
import { failureResponse } from './public-failure';

export async function readCollectionFollowups(db:Pick<PoolClient,'query'>,ids:number[]):Promise<{id:number;followup:CollectionFollowup}[]> {
  const result=await db.query(`SELECT o.id,f.contact_status,f.handling_status,f.customer_condition,f.notes,f.revision,f.updated_at
    FROM himoto.orders o LEFT JOIN himoto.management_collection_followups f ON f.order_id=o.id
    WHERE o.id=ANY($1::bigint[]) AND o.deleted_at IS NULL ORDER BY o.id`,[ids]);
  return result.rows.map(row=>({id:Number(row.id),followup:{contact_status:row.contact_status||'uncontacted',handling_status:row.handling_status||'branch',customer_condition:row.customer_condition||'',notes:row.notes||'',revision:Number(row.revision||0),...(row.updated_at?{updated_at:row.updated_at instanceof Date?row.updated_at.toISOString():String(row.updated_at)}:{})}}));
}

export async function patchCollectionFollowup(request:NextRequest) {
  let client:PoolClient|undefined;
  try{
    let input:ReturnType<typeof parseCollectionFollowup>;
    try{input=parseCollectionFollowup(await request.json());}catch{return NextResponse.json({message:'Kiểm tra tình trạng khách, ghi chú và phiên bản hợp đồng.'},{status:400});}
    const actor=dataAccess.getStore()!;
    client=await himotoPool.connect();
    await client.query('BEGIN');
    const order=(await client.query('SELECT id,store_id FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[input.order_id])).rows[0];
    if(!order){await client.query('ROLLBACK');return NextResponse.json({message:'Không tìm thấy hợp đồng trong phạm vi.'},{status:404});}
    if(!actor.scope_all&&Number(order.store_id)!==actor.store_id){await client.query('ROLLBACK');return NextResponse.json({message:'Hợp đồng ngoài PGD được phân công.'},{status:403});}
    const {order_id,revision,...snapshot}=input;
    const values=[order_id,order.store_id,snapshot.contact_status,snapshot.handling_status,snapshot.customer_condition,snapshot.notes,actor.id,revision];
    const inserted=await client.query(`INSERT INTO himoto.management_collection_followups(order_id,store_id,contact_status,handling_status,customer_condition,notes,updated_by)
      SELECT $1,$2,$3,$4,$5,$6,$7 WHERE $8::integer=0
      ON CONFLICT(order_id) DO NOTHING RETURNING revision`,values);
    const updated=inserted.rowCount?inserted:revision>0?await client.query(`UPDATE himoto.management_collection_followups SET contact_status=$3,handling_status=$4,customer_condition=$5,notes=$6,updated_by=$7,revision=revision+1,updated_at=now()
      WHERE order_id=$1 AND revision=$8 AND store_id=$2 RETURNING revision`,values):inserted;
    if(!updated.rowCount){await client.query('ROLLBACK');return NextResponse.json({message:'Ghi chú đã thay đổi. Tải lại trước khi lưu.'},{status:409});}
    await client.query('INSERT INTO himoto.management_collection_history(order_id,store_id,snapshot,updated_by) VALUES($1,$2,$3,$4)',[order_id,order.store_id,snapshot,actor.id]);
    await client.query('COMMIT');
    return NextResponse.json({data:{revision:updated.rows[0].revision}},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){await client?.query('ROLLBACK').catch(()=>{});return failureResponse('Không lưu được tình trạng khách.',error);}finally{client?.release();}
}
