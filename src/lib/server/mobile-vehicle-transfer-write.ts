import 'server-only';
import type {PoolClient} from 'pg';
import type {NextRequest} from 'next/server';
import type {SessionUser} from './management-session';
import {isMobileVehicleTransferReceipt,type MobileTransferEventProof,type MobileVehicleTransferReceipt} from '../../../shared/mobile-vehicle-transfers';
import {applyVehicleAction} from './vehicle-actions';
import {readPendingVehicleTransfer} from './vehicle-transfers';
import {parseMobileVehicleTransferInput,readTransferVehicle,readVehicleTransferPreview,requireMobileVehicleTransfer,transferConflict,withMobileVehicleTransfer} from './mobile-vehicle-transfers';
import {idempotentMobileWrite,mobileBody,mobileRequestKey} from './mobile-writes';
import {mobileFinanceId} from './mobile-finance';
import {MobileError} from './mobile-session';

const invalidReceipt=()=>new MobileError('Chưa xác nhận được phiếu điều chuyển. Giữ mã để đối chiếu.',503,'INVALID_WRITE_RECEIPT');
const iso=(v:unknown)=>v instanceof Date?v.toISOString():new Date(String(v)).toISOString();
const nullableId=(v:unknown)=>v==null?null:Number(v);
const text=(v:unknown)=>v==null?'':String(v).slice(0,4000);
const eventSql="SELECT e.id,e.xmin::text AS revision,e.event_type,e.ref_id,e.from_store_id,e.to_store_id,e.created_by,e.notes,"+
  "e.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS recorded_at,e.audit_snapshot FROM himoto.vehicle_location_events e WHERE e.vehicle_id=$1";
function eventProof(row:Record<string,unknown>):MobileTransferEventProof {
  const audit=row.audit_snapshot as Record<string,unknown>|null;
  return{id:Number(row.id),revision:String(row.revision),type:String(row.event_type),refId:nullableId(row.ref_id),fromStoreId:nullableId(row.from_store_id),toStoreId:nullableId(row.to_store_id),
    fromStoreName:text(audit?.from_store_name),toStoreName:text(audit?.to_store_name),actorId:Number(row.created_by),actorName:text(audit?.actor_name),
    recordedAt:iso(row.recorded_at),note:text(row.notes)};
}
async function receipt(db:PoolClient,user:SessionUser,key:string):Promise<MobileVehicleTransferReceipt|null> {
  const row=(await db.query('SELECT r.operation,r.resource_id,r.resource_revision,m.proof FROM himoto.management_mobile_requests r '+
    'LEFT JOIN himoto.management_mobile_vehicle_transfers m ON m.user_id=r.user_id AND m.request_id=r.request_id AND m.vehicle_id=r.resource_id '+
    'WHERE r.user_id=$1 AND r.request_id=$2',[user.id,key])).rows[0];
  if(!row||row.resource_id==null||!String(row.operation).startsWith('vehicle.'))return null;
  if(!isMobileVehicleTransferReceipt(row.proof)||row.proof.requestId!==key||row.proof.id!==Number(row.resource_id)||row.proof.revision!==row.resource_revision||
    row.operation!=='vehicle.'+row.proof.action+':'+row.resource_id||row.proof.events.some((e:MobileTransferEventProof)=>e.actorId!==user.id))throw invalidReceipt();
  const result:MobileVehicleTransferReceipt={...row.proof,replayed:true};requireMobileVehicleTransfer(user,result.action);
  // An actor can still inspect their original proof after a soft delete.
  // Deleted stock is excluded from every preparation/preview/new writer.
  const stock=(await db.query('SELECT xmin::text AS revision,deleted_at,status,COALESCE(current_store_id,store_id) AS store_id,store_id AS owner_store_id FROM himoto.vehicles WHERE id=$1',[result.id])).rows[0];
  if(!stock)throw new MobileError('Xe đã ra ngoài phạm vi truy cập hiện tại.',403,'FORBIDDEN');
  result.vehicleCurrent=stock.deleted_at==null&&stock.revision===result.revision&&stock.status===result.review.after.status&&Number(stock.store_id)===result.review.after.storeId&&
    (result.review.after.ownerStoreId===undefined||Number(stock.owner_store_id)===result.review.after.ownerStoreId);
  const events=(await db.query(eventSql+' AND e.id=ANY($2::bigint[]) ORDER BY e.id',[result.id,result.events.map(e=>e.id)])).rows.map(eventProof);
  const fields:(keyof MobileTransferEventProof)[]=['id','revision','type','refId','fromStoreId','toStoreId','fromStoreName','toStoreName','actorId','actorName','recordedAt','note'];
  result.eventsCurrent=events.length===result.events.length&&result.events.every(expected=>events.some(actual=>fields.every(field=>actual[field]===expected[field])));
  const dispatchId=result.action==='transfer'?result.events[0].id:result.review.transfer!.id;
  const dispatchRevision=result.action==='transfer'?result.events[0].revision:result.review.transfer!.revision;
  const current=await readPendingVehicleTransfer(db,result.id,false);
  const resolutions=(await db.query("SELECT id FROM himoto.vehicle_location_events WHERE vehicle_id=$1 AND ref_type='vehicle_location_events' AND ref_id=$2 "+
    "AND event_type IN('manual_transfer_receive','manual_transfer_reject','manual_transfer_cancel') ORDER BY id",[result.id,dispatchId])).rows.map(row=>Number(row.id));
  const expected=result.review.effect==='awaiting_receipt'?[]:[result.events.at(-1)!.id];
  result.transferCurrent=!!current&&Number(current.id)===dispatchId&&current.revision===dispatchRevision&&
    Number(current.receivable)===(result.review.effect==='awaiting_receipt'?1:0)&&JSON.stringify(resolutions)===JSON.stringify(expected);
  result.current=result.vehicleCurrent&&result.eventsCurrent&&result.transferCurrent;return result;
}
export async function readMobileVehicleTransferReceipt(user:SessionUser,key:string) {
  requireMobileVehicleTransfer(user);mobileRequestKey(key);
  return withMobileVehicleTransfer(user,0,'fleet_read',false,async db=>({receipt:await receipt(db,user,key)}));
}
export async function recordMobileVehicleTransfer(user:SessionUser,value:string,request:NextRequest):Promise<MobileVehicleTransferReceipt> {
  requireMobileVehicleTransfer(user);const id=mobileFinanceId(value),key=mobileRequestKey(request.headers.get('idempotency-key'));
  if([...request.nextUrl.searchParams].length)throw new MobileError('Không hỗ trợ bộ lọc khi ghi điều chuyển.',400,'INVALID_QUERY');
  const {review_snapshot,...body}=await mobileBody(request,4096);
  if(typeof review_snapshot!=='string'||!/^[a-f0-9]{64}$/.test(review_snapshot))throw new MobileError('Thiếu phiên rà soát điều chuyển.',400,'INVALID_TRANSFER');
  const input=parseMobileVehicleTransferInput(body);requireMobileVehicleTransfer(user,input.action);
  return withMobileVehicleTransfer(user,id,input.action,true,async db=>{
    const saved=await idempotentMobileWrite(db,user.id,key,'vehicle.'+input.action+':'+id,{id,input,review_snapshot},async()=>{
      const review=await readVehicleTransferPreview(db,user,id,input,true);
      if(review.snapshot!==review_snapshot)throw transferConflict('Xe, kho hoặc lượt chuyển đã thay đổi. Rà soát lại trước khi ghi.');
      const result=await applyVehicleAction(db,id,input,user.id);
      const vehicle=await readTransferVehicle(db,id);
      if(vehicle.status!==review.after.status||vehicle.storeId!==review.after.storeId||vehicle.ownerStoreId!==review.after.ownerStoreId)throw invalidReceipt();
      const rows=(await db.query(eventSql+" AND (e.id=$2 OR (e.ref_type='vehicle_location_events' AND e.ref_id=$2 AND e.created_by=$3)) ORDER BY e.id",
        [id,result.event_id,user.id])).rows;
      const events=rows.map(eventProof);
      if(events.some(e=>e.actorId!==user.id))throw invalidReceipt();
      const proof:MobileVehicleTransferReceipt={id,revision:vehicle.revision,requestId:key,replayed:false,action:input.action,review,events,
        recordedAt:events.at(-1)?.recordedAt??'',vehicleCurrent:true,eventsCurrent:true,transferCurrent:true,current:true};
      if(!isMobileVehicleTransferReceipt(proof))throw invalidReceipt();
      await db.query('INSERT INTO himoto.management_mobile_vehicle_transfers(user_id,request_id,vehicle_id,proof) VALUES($1,$2,$3,$4::jsonb)',[user.id,key,id,JSON.stringify(proof)]);
      return{id,revision:vehicle.revision};
    });
    const result=await receipt(db,user,key);if(!result||result.id!==saved.id||result.revision!==saved.revision)throw invalidReceipt();
    return{...result,replayed:saved.replayed};
  });
}
