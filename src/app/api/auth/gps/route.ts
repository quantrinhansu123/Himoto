import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool,ownerDatabase } from '@/lib/server/himoto-database';
import { dataAccess } from '@/lib/server/access-context';
import { isAdminAccount } from '@/lib/management/permissions';
export const runtime='nodejs';
export const GET=withAccessRequest(async(request:NextRequest)=>{
  const store=request.nextUrl.searchParams.get('store')||'all';
  if(store!=='all'&&!/^[1-9]\d{0,14}$/.test(store))return NextResponse.json({status:'error',message:'Cơ sở không hợp lệ.'},{status:400});
  const source=request.nextUrl.searchParams.get('event_source')||'all',device=request.nextUrl.searchParams.get('event_device')||'';
  if(!['all','poll','history','webhook'].includes(source)||device&&!/^[1-9]\d{0,14}$/.test(device))return NextResponse.json({status:'error',message:'Bộ lọc nhật ký không hợp lệ.'},{status:400});
  try{
    const rows=await himotoPool.query(`SELECT d.id,d.vehicle_id,d.provider,d.external_device_id,d.provider_device_name,d.mapping_status,CASE WHEN d.provider_status='not_visible_in_account' THEN 'unavailable' ELSE d.management_status END AS management_status,CASE WHEN d.provider_status='not_visible_in_account' THEN d.sync_received_at ELSE COALESCE(a.last_success_at,d.sync_received_at) END AS sync_received_at,d.heartbeat_at,d.last_latitude,d.last_longitude,d.last_speed,
      v.license,COALESCE(v.current_store_id,v.store_id) AS store_id,s.store_name
      FROM himoto.gps_devices d LEFT JOIN himoto.management_gps_accounts a ON a.id=d.source_account_id
      LEFT JOIN himoto.vehicles v ON v.id=d.vehicle_id LEFT JOIN himoto.stores s ON s.id=COALESCE(v.current_store_id,v.store_id)
      WHERE ($1::bigint IS NULL OR COALESCE(v.current_store_id,v.store_id)=$1) ORDER BY CASE WHEN d.provider_status='not_visible_in_account' THEN d.sync_received_at ELSE COALESCE(a.last_success_at,d.sync_received_at) END DESC NULLS LAST,d.id DESC LIMIT 2000`,[store==='all'?null:Number(store)]);
    const events=await himotoPool.query(`SELECT e.id,e.vehicle_id,e.from_status,e.to_status,e.observed_at,e.event_kind,e.source,
      CASE WHEN e.source='poll' THEN e.observed_at ELSE COALESCE(e.provider_recorded_at,e.observed_at) END AS event_at,
      COALESCE(v.license,d.provider_device_name,d.external_device_id) AS license
      FROM himoto.management_gps_status_events e JOIN himoto.gps_devices d ON d.id=e.gps_device_id LEFT JOIN himoto.vehicles v ON v.id=e.vehicle_id
      WHERE ($1::bigint IS NULL OR COALESCE(v.current_store_id,v.store_id)=$1)
        AND ($2::text IS NULL OR e.source=$2) AND ($3::bigint IS NULL OR e.gps_device_id=$3)
      ORDER BY event_at DESC,e.id DESC LIMIT 100`,[store==='all'?null:Number(store),source==='all'?null:source,device?Number(device):null]);
    return NextResponse.json({status:'success',data:{devices:rows.rows.map(row=>({...row,id:Number(row.id),vehicle_id:row.vehicle_id===null?null:Number(row.vehicle_id),store_id:row.store_id===null?null:Number(row.store_id),last_latitude:row.last_latitude===null?null:Number(row.last_latitude),last_longitude:row.last_longitude===null?null:Number(row.last_longitude),last_speed:row.last_speed===null?null:Number(row.last_speed)})),events:events.rows}},{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({status:'error',message:'Không tải được trạng thái GPS.'},{status:500});}
});
export const PATCH=withAccessRequest(async(request:NextRequest)=>{
  if(!isAdminAccount(dataAccess.getStore()))return NextResponse.json({status:'error',message:'Chỉ quản trị được ghép GPS với xe.'},{status:403});
  try{const raw=await request.text();if(raw.length>1024)throw Error();const body=JSON.parse(raw);if(!Number.isSafeInteger(body.device_id)||body.device_id<1||body.vehicle_id!==null&&(!Number.isSafeInteger(body.vehicle_id)||body.vehicle_id<1))throw Error();
    const result=await ownerDatabase.query(`UPDATE himoto.gps_devices SET vehicle_id=$2,mapping_status=CASE WHEN $2::bigint IS NULL THEN 'manual_unmapped' ELSE 'manual' END,updated_at=now() AT TIME ZONE 'UTC'
      WHERE id=$1 AND ($2::bigint IS NULL OR EXISTS(SELECT 1 FROM himoto.vehicles WHERE id=$2)) RETURNING id`,[body.device_id,body.vehicle_id]);
    if(!result.rowCount)throw Error();return NextResponse.json({status:'success'});
  }catch{return NextResponse.json({status:'error',message:'Kiểm tra GPS và xe cần ghép.'},{status:400});}
});
