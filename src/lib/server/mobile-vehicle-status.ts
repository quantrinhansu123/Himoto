import 'server-only';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {NextRequest} from 'next/server';
import type {SessionUser} from './management-session';
import {hasPermission} from '@/lib/management/permissions';
import {withMobileData} from './mobile-context';
import {himotoPool} from './himoto-database';
import {MobileError} from './mobile-session';
import {mobileBody,mobileRequestKey,idempotentMobileWrite} from './mobile-writes';
import {mobileVehicleId} from './mobile-vehicles';
import {readTransferVehicle} from './mobile-vehicle-transfers';
import {applyVehicleAction,parseVehicleAction,findVehicleActionCustomer,VehicleActionError} from './vehicle-actions';
import {DraftSaveError} from './contract-drafts';
import {isMobileVehicleStatusPreparation,isMobileVehicleStatusReview,isMobileVehicleStatusReceipt,
  isMobileVehicleStatusInput,
  type MobileVehicleStatusInput,type MobileVehicleStatusPreparation,type MobileVehicleStatusReview,type MobileVehicleStatusReceipt} from '../../../shared/mobile-vehicle-status';

type Database=Pick<PoolClient,'query'>;
const conflict=(message:string)=>new MobileError(message,409,'VEHICLE_STATUS_REVIEW_REQUIRED');
const invalid=()=>new MobileError('Chưa xác nhận được kết quả gốc. Giữ mã để đối chiếu.',503,'INVALID_WRITE_RECEIPT');
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value);
}
function signature(value:unknown) {
  const secret=process.env.MANAGEMENT_SESSION_SECRET;
  if(!secret||secret.length<32)throw new MobileError('Chưa cấu hình xác minh kết quả thao tác xe.',503,'VEHICLE_STATUS_UNAVAILABLE');
  return createHmac('sha256',secret).update('himoto-vehicle-status-v1:'+canonical(value)).digest('hex');
}
const iso=(v:unknown)=>v instanceof Date?v.toISOString():new Date(String(v)).toISOString();
function requireStatus(user:SessionUser,write=true) {
  if(!hasPermission(user,write?'vehicles.write':'vehicles.read'))throw new MobileError('Không có quyền thao tác trạng thái xe.',403,'FORBIDDEN');
}
async function transaction<T>(user:SessionUser,write:boolean,task:(db:PoolClient)=>Promise<T>,operation='status') {
  return withMobileData(user,operation,async()=>{
    const db=await himotoPool.connect();
    try{
      await db.query(write?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await db.query("SET LOCAL statement_timeout='20s'");await db.query("SET LOCAL lock_timeout='5s'");
      const result=await task(db);await db.query('COMMIT');return result;
    }catch(error){
      await db.query('ROLLBACK').catch(()=>{});
      if(error instanceof VehicleActionError||error instanceof DraftSaveError)throw new MobileError(error.message,error.status,'VEHICLE_STATUS_REVIEW_REQUIRED');
      throw error;
    }finally{db.release();}
  });
}
export function parseMobileVehicleStatus(body:Record<string,unknown>):MobileVehicleStatusInput {
  if(body.action==='inventory_status'){
    if(!isMobileVehicleStatusInput(body))throw new MobileError('Chọn trạng thái xe hợp lệ và tải lại phiên bản xe trước khi lưu.');
    return body;
  }
  const names=['action','revision','status','beneficiary_store_id','customer_name','customer_phone','customer_id_card','note'];
  if(Object.keys(body).length!==names.length||Object.keys(body).some(k=>!names.includes(k))||body.action!=='status'||
    typeof body.revision!=='string'||!/^[1-9]\d{0,19}$/.test(body.revision)||typeof body.beneficiary_store_id!=='number'||
    !Number.isSafeInteger(body.beneficiary_store_id)||body.beneficiary_store_id<=0||body.beneficiary_store_id>999999999999999)
    throw new MobileError('Thông tin hoặc phiên bản xe không hợp lệ.');
  try {
    const input=parseVehicleAction(body);
    if(input.action!=='status')throw new MobileError('Thao tác không hợp lệ.');
    return input as MobileVehicleStatusInput;
  } catch(error) {
    if(error instanceof VehicleActionError)throw new MobileError(error.message,error.status,'INVALID_VEHICLE_STATUS');
    throw error;
  }
}
function noQuery(request:NextRequest) {
  if(request.nextUrl.searchParams.size)throw new MobileError('Thao tác trạng thái xe không nhận bộ lọc.');
}
async function context(db:Database,user:SessionUser,id:number,lock=false,inventory=false) {
  const vehicle=await readTransferVehicle(db,id,lock);
  const stores=(await db.query('SELECT id,store_name,xmin::text AS revision FROM himoto.stores ORDER BY store_name,id')).rows.map(r=>({id:Number(r.id),name:String(r.store_name),revision:String(r.revision)}));
  const actorRow=(await db.query('SELECT name FROM himoto.users WHERE id=$1',[user.id])).rows[0];
  if(!actorRow)throw conflict('Không xác định được người thao tác.');
  const actor={id:user.id,name:String(actorRow.name||`Tài khoản #${user.id}`)};
  let blockedReason:string|null=null;
  if(!user.scope_all&&vehicle.storeId!==user.store_id){
    const hq=(await db.query('SELECT himoto.ownership_may_use_headquarters_vehicle($1) AS ok',[vehicle.storeId])).rows[0];
    if(!hq?.ok)blockedReason='Chỉ được thao tác xe tại cơ sở được phân quyền hoặc kho trụ sở chính.';
  }
  if(vehicle.status==='in_transit')blockedReason='Xe đang Chờ luân chuyển. Xử lý lượt chuyển trước khi đổi trạng thái.';
  const inventoryBlockedReason=blockedReason;
  const open=(await db.query('SELECT license,code,store_name,manager_name FROM himoto.vehicle_other_rental_conflicts(ARRAY[$1::bigint],NULL) LIMIT 1',[id])).rows[0];
  if(open&&!inventory)blockedReason=`Xe đang thuộc hợp đồng ${open.code}${open.store_name?` tại ${open.store_name}`:''}${open.manager_name?` (phụ trách: ${open.manager_name})`:''}. Trả xe trên hợp đồng trước khi đổi trạng thái.`;
  return{vehicle,stores,actor,blockedReason,inventoryBlockedReason,hasOpenContract:!!open};
}
export async function readMobileVehicleStatusPreparation(user:SessionUser,value:string,request:NextRequest):Promise<MobileVehicleStatusPreparation> {
  requireStatus(user);noQuery(request);const id=mobileVehicleId(value);
  return transaction(user,false,async db=>{
    const {vehicle,stores,actor,blockedReason,inventoryBlockedReason,hasOpenContract}=await context(db,user,id);
    const status=vehicle.status==='rent'?'using':vehicle.status;
    const result:MobileVehicleStatusPreparation={id,vehicle,stores,actor,available:blockedReason===null,blockedReason,
      defaults:{status:status==='ready'||status==='using'?status:'',storeId:vehicle.storeId},observedAt:new Date().toISOString(),
      inventory:{available:inventoryBlockedReason===null,blockedReason:inventoryBlockedReason,status:({rent:'using',maintenance:'repairing',holding:'pending'} as Record<string,string>)[vehicle.status]||vehicle.status,hasOpenContract}};
    if(!isMobileVehicleStatusPreparation(result))throw conflict('Thông tin xe cần đối chiếu trên web.');return result;
  });
}
async function review(db:Database,user:SessionUser,id:number,input:MobileVehicleStatusInput,lock=false):Promise<MobileVehicleStatusReview> {
  const {vehicle,stores,actor,blockedReason}=await context(db,user,id,lock,input.action==='inventory_status');
  if(blockedReason)throw conflict(blockedReason);
  if(vehicle.revision!==input.revision)throw conflict('Thông tin xe đã thay đổi. Tải lại và rà soát trước khi ghi.');
  const status=({rent:'using',maintenance:'repairing',holding:'pending'} as Record<string,string>)[vehicle.status]||vehicle.status;
  if(status===input.status)throw conflict('Xe đang ở trạng thái đã chọn. Chọn thao tác khác.');
  if(input.action==='inventory_status'){
    const store=stores.find(row=>row.id===vehicle.storeId);
    if(!store)throw conflict('Không đọc được cơ sở hiện tại của xe. Tải lại để đối chiếu.');
    const fields={id,vehicle,input,store,actor,customer:null,effect:'inventory' as const};
    const result={...fields,snapshot:hash({fields}),observedAt:new Date().toISOString()};
    if(!isMobileVehicleStatusReview(result))throw conflict('Thông tin rà soát trạng thái xe chưa hợp lệ.');
    return result;
  }
  if(input.status==='using'&&status!=='ready')throw conflict('Xe phải đang Lưu kho trước khi lập hợp đồng mới.');
  const store=stores.find(s=>s.id===input.beneficiary_store_id);
  if(!store)throw conflict('Cơ sở đã chọn không còn tồn tại hoặc ngoài phạm vi.');
  if(lock){
    await db.query('SELECT id FROM himoto.stores WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE',[[...new Set([vehicle.storeId,vehicle.ownerStoreId,store.id].filter(v=>v!=null))]]);
    if(input.status==='using')await db.query('LOCK TABLE himoto.customers IN SHARE ROW EXCLUSIVE MODE');
    return review(db,user,id,input,false);
  }
  const found=input.status==='using'?await findVehicleActionCustomer(db,input):null;
  const fields={id,vehicle,input,store,actor,customer:found?{id:found.id,name:found.name,matchedBy:found.matched_by}:null,effect:input.status==='using'?'draft' as const:'ready' as const};
  const result={...fields,snapshot:hash({fields,customerRow:found?.row??null}),observedAt:new Date().toISOString()};
  if(!isMobileVehicleStatusReview(result))throw conflict('Thông tin rà soát trạng thái xe chưa hợp lệ.');return result;
}
export async function previewMobileVehicleStatus(user:SessionUser,value:string,request:NextRequest) {
  requireStatus(user);noQuery(request);
  if(request.headers.has('idempotency-key'))throw new MobileError('Rà soát không sử dụng mã ghi.');
  const id=mobileVehicleId(value),input=parseMobileVehicleStatus(await mobileBody(request,4096));
  return transaction(user,false,db=>review(db,user,id,input));
}
const eventSql="SELECT id,vehicle_id,event_type,ref_type,ref_id,from_store_id,to_store_id,created_by,notes,customer_name,customer_phone,customer_id_card,audit_snapshot,created_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS recorded_at FROM himoto.vehicle_location_events";
function eventFingerprint(row:Record<string,unknown>) {
  const audit={...(row.audit_snapshot as Record<string,unknown>)};delete audit.mobile_status_receipt;
  return hash({...row,audit_snapshot:audit,recorded_at:iso(row.recorded_at)});
}
async function readReceipt(db:Database,user:SessionUser,key:string):Promise<MobileVehicleStatusReceipt|null> {
  const request=(await db.query('SELECT operation,resource_id,resource_revision FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2',[user.id,key])).rows[0];
  if(!request||request.resource_id==null||!/^vehicle\.status:[1-9]\d*$/.test(request.operation))return null;
  const rows=(await db.query(eventSql+" WHERE vehicle_id=$1 AND created_by=$2 AND audit_snapshot #>> '{mobile_status_receipt,proof,requestId}'=$3 LIMIT 2",[request.resource_id,user.id,key])).rows;
  if(rows.length!==1)throw invalid();
  const row=rows[0],saved=row.audit_snapshot?.mobile_status_receipt,proof=saved?.proof;
  const payload={proof,eventHash:saved?.eventHash,draftRevision:saved?.draftRevision};
  if(typeof saved?.signature!=='string'||!/^[a-f0-9]{64}$/.test(saved.signature)||!timingSafeEqual(Buffer.from(signature(payload)),Buffer.from(saved.signature)))throw invalid();
  if(!isMobileVehicleStatusReceipt(proof)||proof.requestId!==key||proof.id!==Number(request.resource_id)||proof.revision!==request.resource_revision||
    request.operation!==`vehicle.status:${proof.id}`||proof.actorId!==user.id||proof.eventId!==Number(row.id)||row.event_type!=='status_change')throw invalid();
  const vehicle=(await db.query('SELECT xmin::text AS revision,deleted_at,status,store_id,COALESCE(current_store_id,store_id) AS current_store FROM himoto.vehicles WHERE id=$1',[proof.id])).rows[0];
  if(!vehicle)throw new MobileError('Xe đã ra ngoài phạm vi hiện tại. Giữ mã để đối chiếu.',403,'FORBIDDEN');
  const vehicleCurrent=vehicle.deleted_at==null&&vehicle.revision===proof.revision&&vehicle.status===(proof.review.effect==='inventory'?proof.review.input.status:'ready')&&Number(vehicle.current_store)===proof.review.vehicle.storeId&&
    (proof.review.vehicle.ownerStoreId==null||Number(vehicle.store_id)===proof.review.vehicle.ownerStoreId);
  let draftCurrent=true;
  if(proof.draft){
    const draft=(await db.query('SELECT xmin::text AS revision,order_status,deleted_at FROM himoto.orders WHERE id=$1',[proof.draft.id])).rows[0];
    draftCurrent=!!draft&&draft.deleted_at==null&&draft.order_status==='draft'&&draft.revision===saved.draftRevision;
  }
  const eventCurrent=eventFingerprint(row)===saved.eventHash;
  return{...proof,replayed:true,vehicleCurrent,eventCurrent,draftCurrent,current:vehicleCurrent&&eventCurrent&&draftCurrent};
}
export async function readMobileVehicleStatusReceipt(user:SessionUser,key:string) {
  requireStatus(user,false);mobileRequestKey(key);
  return transaction(user,false,async db=>({receipt:await readReceipt(db,user,key)}),'fleet_read');
}
export async function recordMobileVehicleStatus(user:SessionUser,value:string,request:NextRequest):Promise<MobileVehicleStatusReceipt> {
  requireStatus(user);noQuery(request);const id=mobileVehicleId(value),key=mobileRequestKey(request.headers.get('idempotency-key'));
  const {review_snapshot,...body}=await mobileBody(request,4096),input=parseMobileVehicleStatus(body);
  if(typeof review_snapshot!=='string'||!/^[a-f0-9]{64}$/.test(review_snapshot))throw new MobileError('Thiếu phiên rà soát trạng thái xe.');
  return transaction(user,true,async db=>{
    const saved=await idempotentMobileWrite(db,user.id,key,`vehicle.status:${id}`,{id,input,review_snapshot},async()=>{
      const checked=await review(db,user,id,input,true);
      if(checked.snapshot!==review_snapshot)throw conflict('Xe, cơ sở hoặc hồ sơ khách đã thay đổi. Rà soát lại trước khi ghi.');
      const result=await applyVehicleAction(db,id,input,user.id),vehicle=await readTransferVehicle(db,id);
      if(vehicle.status!==(input.action==='inventory_status'?input.status:'ready')||vehicle.storeId!==checked.vehicle.storeId||vehicle.ownerStoreId!==checked.vehicle.ownerStoreId)throw invalid();
      const event=(await db.query(eventSql+' WHERE id=$1 AND vehicle_id=$2 AND created_by=$3',[result.event_id,id,user.id])).rows[0];
      if(!event)throw invalid();
      const proof:MobileVehicleStatusReceipt={id,revision:vehicle.revision,requestId:key,replayed:false,review:checked,eventId:result.event_id,
        actorId:user.id,actorName:checked.actor.name,recordedAt:iso(event.recorded_at),customer:result.customer??null,draft:result.draft??null,
        vehicleCurrent:true,eventCurrent:true,draftCurrent:true,current:true};
      if(!isMobileVehicleStatusReceipt(proof))throw invalid();
      const draft=result.draft?(await db.query('SELECT xmin::text AS revision FROM himoto.orders WHERE id=$1',[result.draft.id])).rows[0]:null;
      if(result.draft&&!draft)throw invalid();
      // Existing audit column, same scoped transaction; no owner connection or new table.
      const payload={proof,eventHash:eventFingerprint(event),draftRevision:draft?.revision??null};
      const updated=await db.query("UPDATE himoto.vehicle_location_events SET audit_snapshot=jsonb_set(audit_snapshot,'{mobile_status_receipt}',$4::jsonb) WHERE id=$1 AND vehicle_id=$2 AND created_by=$3 RETURNING id",
        [result.event_id,id,user.id,JSON.stringify({...payload,signature:signature(payload)})]);
      if(updated.rowCount!==1)throw invalid();
      return{id,revision:vehicle.revision};
    });
    const result=await readReceipt(db,user,key);if(!result||result.id!==saved.id||result.revision!==saved.revision)throw invalid();
    return{...result,replayed:saved.replayed};
  });
}
