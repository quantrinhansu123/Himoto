import 'server-only';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {NextRequest} from 'next/server';
import type {SessionUser} from './management-session';
import {dataAccess} from './access-context';
import {himotoPool} from './himoto-database';
import {hasPermission,isAdminAccount} from '@/lib/management/permissions';
import {contractPhotoSlots,contractDocumentSlots,contractPhotoLabel,contractPhotoWritePermission,CONTRACT_CUSTOMER_PHOTO_SLOTS,type ContractPhotoPhase} from '@/lib/management/contract-photos';
import {vehicleTransferPhotoSlots,VEHICLE_DOCUMENT_SLOTS} from '@/lib/management/record-photos';
import {photoBaseSlot,isSupplementalPhotoSlot} from '@/lib/management/photo-slot-groups';
import {contractVehicleLabelSource} from './contract-vehicle-reads';
import {parsePhotoTarget,requireContractPhotoSlot,RecordPhotoError,validatePhotoBytes} from './record-photos';
import {MobileError} from './mobile-session';
import {contractRenewalMediaVersions} from './contract-renewal-version';
import {isMobileMediaIdentity,isMobileMediaSlot,isMediaRevision,isMobileRecordMedia,isMobileMediaSlotInfo,isMobileMediaTargets,mediaSlotPattern,
  type MobileMediaIdentity,type MobileMediaTarget,type MobileMediaPhoto,type MobileMediaSlot,type MobileRecordMedia,type MobileMediaSlotInfo,type MobileMediaTargets} from '../../../shared/mobile-record-media';

type Database=Pick<PoolClient,'query'>;
type Params={entity:string;id:string;kind:string;referenceId:string};
const text=(v:unknown)=>v==null?'':String(v).slice(0,4000);
// Inventory labels cover a draft before issued order lines exist; historical
// contract labels retain stock which has since moved outside the caller's store.
const plateLabels=()=>'(SELECT DISTINCT ON(id) id,name,license FROM (SELECT id,name,license,0 AS priority FROM himoto.vehicle_inventory() UNION ALL SELECT id,name,license,1 AS priority FROM '+contractVehicleLabelSource()+') labels ORDER BY id,priority)';
export function parseMobileMediaTarget(raw:Params):MobileMediaIdentity {
  const target={entity:raw.entity,id:Number(raw.id),kind:raw.kind,referenceId:Number(raw.referenceId)};
  if(!/^[1-9]\d{0,14}$/.test(raw.id)||!/^[1-9]\d{0,14}$/.test(raw.referenceId)||!isMobileMediaIdentity(target))
    throw new MobileError('Hồ sơ và lượt ghi nhận media không hợp lệ.',400,'INVALID_MEDIA_TARGET');
  return target;
}
function requireMedia(user:SessionUser,target:MobileMediaIdentity) {
  // Web record-photos is available to every authenticated actor; customer row
  // visibility still comes from scopedConnect/RLS, not the profile editor grant.
  if(target.entity==='customers'||target.entity==='contracts')return;
  if(!hasPermission(user,'vehicles.read'))throw new MobileError('Tài khoản không có quyền xem hồ sơ này.',403,'FORBIDDEN');
}
export function requireMobileMediaWrite(user:SessionUser,target:MobileMediaIdentity,slot:string) {
  requireMedia(user,target);
  if(target.entity==='customers'){
    if(!isMobileMediaSlot(target,slot))throw new MobileError('Ô giấy tờ không hợp lệ.',400,'INVALID_MEDIA_TARGET');
    return;
  }
  const permission=target.entity==='contracts'?contractPhotoWritePermission(slot):'vehicles.read';
  if(!isMobileMediaSlot(target,slot)||!permission||!hasPermission(user,permission))throw new MobileError('Tài khoản không có quyền lưu ảnh này.',403,'FORBIDDEN');
}
export async function withMobileMedia<T>(user:SessionUser,target:MobileMediaIdentity,task:(db:PoolClient)=>Promise<T>,write:boolean|'repeatable'=false) {
  requireMedia(user,target);
  // Match the web record-photo wrapper: one pinned vehicle in transfer context.
  // Fleet_read alone cannot read transfer photos under the existing photo RLS.
  return dataAccess.run({...user,store_id:user.store_id??null,scope_all:user.scope_all===true,
    operation:target.entity==='vehicles'?'transfer':'',transfer_vehicle_id:target.entity==='vehicles'?String(target.id):''},async()=>{
    const db=await himotoPool.connect();
    try{
      await db.query(write==='repeatable'?'BEGIN ISOLATION LEVEL REPEATABLE READ':write?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await db.query("SET LOCAL statement_timeout='20s'");await db.query("SET LOCAL lock_timeout='5s'");
      const result=await task(db);await db.query('COMMIT');return result;
    }catch(error){
      await db.query('ROLLBACK').catch(()=>{});
      if(error instanceof RecordPhotoError)throw new MobileError(error.message,error.status,error.status===404?'NOT_FOUND':'MEDIA_REVIEW_REQUIRED');
      throw error;
    }finally{db.release();}
  });
}
const missing=()=>new MobileError('Không tìm thấy hồ sơ hoặc lượt ghi nhận trong phạm vi hiện tại.',404,'NOT_FOUND');
// Older/issued records may have a null or differently shaped draft payload.
// Only an array contributes draft vehicle IDs; issued lines remain authoritative.
const draftVehicleRows="jsonb_array_elements(CASE jsonb_typeof(o.draft_payload #> '{management_composer,draft,vehicles}') WHEN 'array' THEN o.draft_payload #> '{management_composer,draft,vehicles}' ELSE '[]'::jsonb END)";
function targetSnapshot(target:MobileMediaIdentity,revision:string,referenceRevision:string,label:string,canWrite?:boolean):MobileMediaTarget {
  const fields={entity:target.entity,id:target.id,kind:target.kind,referenceId:target.referenceId,revision,referenceRevision,label,...(canWrite===undefined?{}:{canWrite})};return{...fields,snapshot:createHash('sha256').update(JSON.stringify(fields)).digest('hex')};
}
export async function readMobileMediaTargets(user:SessionUser,raw:{entity:string;id:string},request:NextRequest):Promise<MobileMediaTargets> {
  const context=parseMobileMediaTarget({...raw,kind:raw.entity==='customers'?'customer':raw.entity==='contracts'?'return':'transfer',referenceId:raw.entity==='customers'?raw.id:'1'}),p=request.nextUrl.searchParams,page=p.get('page')??'1';
  if([...p.keys()].some(k=>k!=='page'||p.getAll(k).length!==1)||!/^[1-9]\d{0,4}$/.test(page)||Number(page)>10000||request.headers.has('idempotency-key'))throw new MobileError('Trang hồ sơ ảnh không hợp lệ.',400,'INVALID_QUERY');
  return withMobileMedia(user,context,async db=>{
    if(context.entity==='customers'){
      const target=await readMediaTarget(db,context);
      return {entity:context.entity,id:context.id,page:Number(page),hasMore:false,rows:Number(page)===1?[target]:[],observedAt:new Date().toISOString()};
    }
    const parent=(await db.query('SELECT id,xmin::text AS revision'+(context.entity==='vehicles'?',name,license':'')+' FROM himoto.'+(context.entity==='contracts'?'orders':'vehicles')+' WHERE id=$1 AND deleted_at IS NULL',[context.id])).rows[0];
    if(!parent)throw missing();
    const labels=contractVehicleLabelSource();
    const sql=context.entity==='contracts'?"SELECT 'rental' AS kind,o.id AS reference_id,o.xmin::text AS reference_revision,'' AS name,'' AS license,NULL::text AS to_license,-2 AS sequence FROM himoto.orders o WHERE o.id=$1 "+
      "UNION ALL SELECT 'plate' AS kind,v.id AS reference_id,o.xmin::text AS reference_revision,v.name,v.license,NULL::text AS to_license,-1 AS sequence FROM "+plateLabels()+" v CROSS JOIN himoto.orders o WHERE o.id=$1 AND v.id IN ("+
      "SELECT d.vehicle_id FROM himoto.order_vehicle_details d WHERE d.order_id=$1 AND d.deleted_at IS NULL UNION SELECT (x->>'id')::bigint FROM himoto.orders o CROSS JOIN LATERAL "+draftVehicleRows+" x WHERE o.id=$1 AND x->>'id' ~ '^[1-9][0-9]{0,14}$') "+
      "UNION ALL SELECT 'return' AS kind,d.id AS reference_id,d.xmin::text AS reference_revision,v.name,v.license,NULL::text AS to_license,0 AS sequence "+
      'FROM himoto.order_vehicle_details d LEFT JOIN '+labels+' v ON v.id=d.vehicle_id WHERE d.order_id=$1 AND d.deleted_at IS NULL '+
      "UNION ALL SELECT 'swap' AS kind,s.id AS reference_id,s.xmin::text AS reference_revision,'' AS name,a.license,b.license AS to_license,1 AS sequence "+
      'FROM himoto.management_contract_vehicle_swaps s LEFT JOIN '+labels+' a ON a.id=s.from_vehicle_id LEFT JOIN '+labels+' b ON b.id=s.to_vehicle_id '+
      'WHERE s.order_id=$1 ORDER BY sequence,reference_id DESC LIMIT 26 OFFSET $2':
      "SELECT 'vehicle' AS kind,id AS reference_id,xmin::text AS reference_revision,-1 AS sequence FROM himoto.vehicles WHERE id=$1 AND deleted_at IS NULL "+
      "UNION ALL SELECT CASE WHEN event_type='manual_transfer' THEN 'transfer' ELSE 'receive' END AS kind,id AS reference_id,xmin::text AS reference_revision,0 AS sequence FROM himoto.vehicle_location_events "+
      "WHERE vehicle_id=$1 AND event_type IN('manual_transfer','manual_transfer_receive') ORDER BY sequence,reference_id DESC LIMIT 26 OFFSET $2";
    const rows=(await db.query(sql,[context.id,(Number(page)-1)*25])).rows;
    const targets=rows.slice(0,25).map(row=>targetSnapshot({entity:context.entity,id:context.id,kind:row.kind,referenceId:Number(row.reference_id)},String(parent.revision),String(row.reference_revision),
      row.kind==='rental'?'Ảnh lập hợp đồng / giao xe':row.kind==='plate'?'Biển số · '+(text(row.license)||text(row.name)||'#'+row.reference_id):row.kind==='return'?'Trả xe · '+(text(row.license)||text(row.name)||'#'+row.reference_id):row.kind==='swap'?'Đổi xe · '+(text(row.license)||'Xe cũ')+' → '+(text(row.to_license)||'Xe mới'):
      (row.kind==='vehicle'?'Giấy tờ xe · ':row.kind==='transfer'?'Chuyển xe · ':'Nhận xe · ')+(text(parent.license)||text(parent.name)||'#'+context.id)));
    const result:MobileMediaTargets={entity:context.entity,id:context.id,page:Number(page),hasMore:rows.length>25,rows:targets,observedAt:new Date().toISOString()};
    if(!isMobileMediaTargets(result))throw new MobileError('Danh sách hồ sơ ảnh cần tải lại.',409,'MEDIA_REVIEW_REQUIRED');return result;
  });
}
export async function readMediaTarget(db:Database,target:MobileMediaIdentity,lock=false):Promise<MobileMediaTarget> {
  let parent,reference,label;
  if(target.entity==='customers'){
    // FOR SHARE/UPDATE applies the same profile ownership boundary as the web
    // writer. A linked foreign customer may be read without gaining edit scope.
    parent=(await db.query('SELECT id,name,store_id,xmin::text AS revision FROM himoto.customers WHERE id=$1'+(lock?' FOR UPDATE':''),[target.id])).rows[0];
    if(!parent)throw missing();
    reference=parent;label='Giấy tờ khách · '+text(parent.name);
    const user=dataAccess.getStore();
    const canWrite=!!user&&(isAdminAccount(user)||user.scope_all===true||parent.store_id!=null&&Number(parent.store_id)===user.store_id);
    if(lock&&!canWrite)throw new MobileError('Hồ sơ này chỉ được xem trong phạm vi hiện tại.',403,'FORBIDDEN');
    return targetSnapshot(target,String(parent.revision),String(reference.revision),label,canWrite);
  }else if(target.entity==='contracts'){
    parent=(await db.query('SELECT id,xmin::text AS revision FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL'+(lock?' FOR UPDATE':''),[target.id])).rows[0];
    if(!parent)throw missing();
    if(target.kind==='rental')return targetSnapshot(target,String(parent.revision),String(parent.revision),'Ảnh lập hợp đồng / giao xe');
    if(target.kind==='renewal'||target.kind==='renewal_receipt'||target.kind==='battery_swap') {
      reference=await readMediaReference(db,target,parent,lock);if(!reference)throw missing();
      await requireContractPhotoSlot(db,target.entity,target.id,defaultSlots(target)[0].slot);
      return targetSnapshot(target,String(parent.revision),String(reference.revision),historyMediaLabel(target.kind,target.referenceId));
    }
    if(target.kind==='plate'){
      const vehicle=(await db.query('SELECT v.id,v.name,v.license FROM '+plateLabels()+' v WHERE v.id=$2 AND (EXISTS(SELECT 1 FROM himoto.order_vehicle_details d WHERE d.order_id=$1 AND d.vehicle_id=v.id AND d.deleted_at IS NULL) OR EXISTS(SELECT 1 FROM himoto.orders o CROSS JOIN LATERAL '+draftVehicleRows+' x WHERE o.id=$1 AND x->>\'id\'=v.id::text))',[target.id,target.referenceId])).rows[0];
      if(!vehicle)throw missing();return targetSnapshot(target,String(parent.revision),String(parent.revision),'Biển số · '+(text(vehicle.license)||text(vehicle.name)||'#'+target.referenceId));
    }
    const labels=contractVehicleLabelSource();
    if(target.kind==='return'){
      reference=(await db.query('SELECT d.id,d.xmin::text AS revision,v.name,v.license FROM himoto.order_vehicle_details d LEFT JOIN '+labels+
        ' v ON v.id=d.vehicle_id WHERE d.order_id=$1 AND d.id=$2 AND d.deleted_at IS NULL'+(lock?' FOR SHARE OF d':''),[target.id,target.referenceId])).rows[0];
      if(!reference)throw missing();label='Trả xe · '+(text(reference.license)||text(reference.name)||'#'+target.referenceId);
    }else{
      reference=(await db.query('SELECT s.id,s.xmin::text AS revision,a.license AS from_license,b.license AS to_license '+
        'FROM himoto.management_contract_vehicle_swaps s LEFT JOIN '+labels+' a ON a.id=s.from_vehicle_id LEFT JOIN '+labels+
        ' b ON b.id=s.to_vehicle_id WHERE s.order_id=$1 AND s.id=$2'+(lock?' FOR SHARE OF s':''),[target.id,target.referenceId])).rows[0];
      if(!reference)throw missing();label='Đổi xe · '+(text(reference.from_license)||'Xe cũ')+' → '+(text(reference.to_license)||'Xe mới');
    }
  }else{
    parent=(await db.query('SELECT id,xmin::text AS revision,name,license FROM himoto.vehicles WHERE id=$1 AND deleted_at IS NULL'+(lock?' FOR UPDATE':''),[target.id])).rows[0];
    if(!parent)throw missing();
    if(target.kind==='vehicle'){
      await requireContractPhotoSlot(db,target.entity,target.id,defaultSlots(target)[0].slot);
      return targetSnapshot(target,String(parent.revision),String(parent.revision),'Giấy tờ xe · '+(text(parent.license)||text(parent.name)||'#'+target.id));
    }
    reference=(await db.query('SELECT id,xmin::text AS revision FROM himoto.vehicle_location_events WHERE vehicle_id=$1 AND id=$2 AND event_type=$3'+(lock?' FOR SHARE':''),
      [target.id,target.referenceId,target.kind==='transfer'?'manual_transfer':'manual_transfer_receive'])).rows[0];
    if(!reference)throw missing();label=(target.kind==='transfer'?'Chuyển xe · ':'Nhận xe · ')+(text(parent.license)||text(parent.name)||'#'+target.id);
  }
  await requireContractPhotoSlot(db,target.entity,target.id,defaultSlots(target)[0].slot);
  return targetSnapshot(target,String(parent.revision),String(reference.revision),label);
}
function historyMediaLabel(kind:MobileMediaIdentity['kind'],referenceId:number) {return(kind==='renewal'?'Gia hạn · kỳ #':kind==='renewal_receipt'?'Phiếu gia hạn · #':'Đổi pin · #')+referenceId;}
export async function readMediaReference(db:Database,target:MobileMediaIdentity,parent:Record<string,unknown>,lock=false) {
  if(target.entity==='customers'||target.kind==='rental'||target.kind==='plate'||target.kind==='vehicle'||target.kind==='renewal')return parent;
  if(target.kind==='renewal_receipt')return(await db.query('SELECT xmin::text AS revision FROM himoto.management_contract_payments WHERE order_id=$1 AND transaction_id=$2 AND renewal_payload IS NOT NULL'+(lock?' FOR SHARE':''),[target.id,target.referenceId])).rows[0];
  if(target.kind==='battery_swap')return(await db.query('SELECT xmin::text AS revision FROM himoto.management_contract_battery_swaps WHERE order_id=$1 AND id=$2'+(lock?' FOR SHARE':''),[target.id,target.referenceId])).rows[0];
  if(target.kind==='return')return(await db.query('SELECT xmin::text AS revision,deleted_at FROM himoto.order_vehicle_details WHERE order_id=$1 AND id=$2',[target.id,target.referenceId])).rows[0];
  if(target.kind==='swap')return(await db.query('SELECT xmin::text AS revision FROM himoto.management_contract_vehicle_swaps WHERE order_id=$1 AND id=$2',[target.id,target.referenceId])).rows[0];
  return(await db.query('SELECT xmin::text AS revision FROM himoto.vehicle_location_events WHERE vehicle_id=$1 AND id=$2 AND event_type=$3',[target.id,target.referenceId,target.kind==='transfer'?'manual_transfer':'manual_transfer_receive'])).rows[0];
}
export async function readMobileMediaHistoryTargets(user:SessionUser,id:string,request:NextRequest):Promise<MobileMediaTargets> {
  const target=parseMobileMediaTarget({entity:'contracts',id,kind:'rental',referenceId:id}),p=request.nextUrl.searchParams,page=p.get('page')??'1';
  if([...p.keys()].some(k=>k!=='page'||p.getAll(k).length!==1)||!/^[1-9]\d{0,4}$/.test(page)||Number(page)>10000||request.headers.has('idempotency-key'))throw new MobileError('Trang hồ sơ ảnh không hợp lệ.',400,'INVALID_QUERY');
  return withMobileMedia(user,target,async db=>{
    const parent=(await db.query('SELECT xmin::text AS revision,draft_payload,order_status FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL',[target.id])).rows[0];if(!parent)throw missing();
    const versions=await contractRenewalMediaVersions(db,target.id,parent.draft_payload?.management_composer?.versions,!['draft','cancelled'].includes(String(parent.order_status||'')));
    const rows=(await db.query("SELECT 'renewal' AS kind,v AS reference_id,$3::text AS reference_revision FROM unnest($2::bigint[]) AS versions(v) "+
      "UNION ALL SELECT 'renewal_receipt' AS kind,transaction_id AS reference_id,xmin::text AS reference_revision FROM himoto.management_contract_payments WHERE order_id=$1 AND renewal_payload IS NOT NULL "+
      "UNION ALL SELECT 'battery_swap' AS kind,id AS reference_id,xmin::text AS reference_revision FROM himoto.management_contract_battery_swaps WHERE order_id=$1 ORDER BY kind,reference_id DESC LIMIT 26 OFFSET $4",[target.id,versions,parent.revision,(Number(page)-1)*25])).rows;
    const result:MobileMediaTargets={entity:'contracts',id:target.id,page:Number(page),hasMore:rows.length>25,rows:rows.slice(0,25).map(row=>targetSnapshot({...target,kind:row.kind,referenceId:Number(row.reference_id)},parent.revision,row.reference_revision,historyMediaLabel(row.kind,Number(row.reference_id)))),observedAt:new Date().toISOString()};
    if(!isMobileMediaTargets(result))throw new MobileError('Danh sách hồ sơ ảnh cần tải lại.',409,'MEDIA_REVIEW_REQUIRED');return result;
  });
}
export async function readMobileMediaSlotInfo(user:SessionUser,raw:Params,slot:string,request:NextRequest):Promise<MobileMediaSlotInfo> {
  const target=parseMobileMediaTarget(raw);requireMedia(user,target);
  if(request.nextUrl.search||request.headers.has('idempotency-key'))throw new MobileError('Không hỗ trợ bộ lọc hoặc mã ghi khi đọc ô ảnh.',400,'INVALID_QUERY');
  if(!isMobileMediaSlot(target,slot))throw new MobileError('Ô ảnh không thuộc lượt ghi nhận này.',400,'INVALID_MEDIA_TARGET');
  parsePhotoTarget(target.entity,String(target.id),slot);
  return withMobileMedia(user,target,async db=>{
    const prepared=await readMediaTarget(db,target),row=(await db.query(photoSql+' AND slot=$3',[target.entity,target.id,slot])).rows[0];
    const base=photoBaseSlot(slot);let nextSlot:string|null=null;
    if(!/-video-[1-3]$/.test(base)){
      const largest=(await db.query("SELECT COALESCE(max(substring(slot from '-extra-([0-9]+)$')::bigint),1)::text AS largest FROM himoto.management_record_photos "+
        "WHERE entity_type=$1 AND entity_id=$2 AND slot ~ $3",[target.entity,target.id,'^'+base+'-extra-([2-9]|[1-9][0-9]{1,14})$'])).rows[0];
      const n=Number(largest.largest)+1;if(n<=999999999999999&&base+'-extra-'+n!==slot)nextSlot=base+'-extra-'+n;
    }
    const result:MobileMediaSlotInfo={target:prepared,slot,label:mediaPhotoLabel(target,slot),photo:row?mapMediaPhoto(target,row):null,nextSlot,observedAt:new Date().toISOString()};
    if(!isMobileMediaSlotInfo(result))throw new MobileError('Ô ảnh cần đối chiếu lại.',409,'MEDIA_REVIEW_REQUIRED');return result;
  });
}
function defaultSlots(target:MobileMediaIdentity):MobileMediaSlot[] {
  if(target.entity==='vehicles'&&target.kind==='vehicle')return VEHICLE_DOCUMENT_SLOTS.map(row=>({slot:row.key,label:row.label,kind:'image'}));
  if(target.entity==='customers')return [
    {slot:'id_front',label:'CCCD mặt trước / trang hộ chiếu',kind:'image'},
    {slot:'id_back',label:'CCCD mặt sau / trang bổ sung',kind:'image'},
    {slot:'driver_license',label:'Giấy phép lái xe',kind:'image'},
  ];
  if(target.kind==='plate')return [{slot:`plate-${target.referenceId}`,label:'Ảnh biển số xe',kind:'image'}];
  if(target.kind==='renewal'||target.kind==='renewal_receipt'||target.kind==='battery_swap') {
    const phase=`${target.kind==='renewal'?'renewal':target.kind==='renewal_receipt'?'renewal-receipt':'battery-swap'}-${target.referenceId}` as ContractPhotoPhase;
    return [...contractPhotoSlots(phase),...contractDocumentSlots(phase)].map(s=>({slot:s.key,label:contractPhotoLabel(s.key),kind:/-video-[1-3]$/.test(s.key)?'video':'image'}));
  }
  if(target.kind==='rental')return [...contractDocumentSlots('rental'),...contractPhotoSlots('rental'),...CONTRACT_CUSTOMER_PHOTO_SLOTS,{key:'driver-license',label:'GPLX chụp khi lập hợp đồng'},...contractDocumentSlots('handover'),...contractPhotoSlots('handover')].map(s=>({slot:s.key,label:contractPhotoLabel(s.key),kind:/-video-[1-3]$/.test(s.key)?'video':'image'}));
  const phase=(target.kind==='swap'?'vehicle-swap-':'return-')+target.referenceId as ContractPhotoPhase;
  const slots=target.entity==='vehicles'?vehicleTransferPhotoSlots(target.referenceId,target.kind as 'transfer'|'receive'):
    target.kind==='return'?[...contractPhotoSlots(phase),...contractDocumentSlots(phase)]:contractPhotoSlots(phase);
  return slots.map(slot=>({slot:slot.key,label:slot.label,kind:/-video-[1-3]$/.test(slot.key)?'video':'image'}));
}
export function mediaPhotoLabel(target:MobileMediaIdentity,slot:string) {
  if(target.entity==='vehicles'&&target.kind==='vehicle')return (defaultSlots(target).find(row=>row.slot===photoBaseSlot(slot))?.label??'Giấy tờ xe')+(isSupplementalPhotoSlot(slot)?' · Ảnh '+slot.split('-').at(-1):'');
  if(target.entity==='customers')return (defaultSlots(target).find(row=>row.slot===photoBaseSlot(slot))?.label??'Giấy tờ khách')+
    (isSupplementalPhotoSlot(slot)?' · Ảnh '+slot.split('-').at(-1):'');
  if(target.kind==='plate')return 'Ảnh biển số xe'+(isSupplementalPhotoSlot(slot)?' · Ảnh '+slot.split('-').at(-1):'');
  if(target.entity==='contracts')return contractPhotoLabel(slot);
  return(target.kind==='transfer'?'Ảnh chuyển xe':'Ảnh nhận xe')+(isSupplementalPhotoSlot(slot)?' · Ảnh '+slot.split('-').at(-1):'');
}
export function mapMediaPhoto(target:MobileMediaIdentity,row:Record<string,unknown>):MobileMediaPhoto {
  const mimeType=text(row.mime_type),bytes=row.byte_count==null?null:Number(row.byte_count);
  const kind=['image/jpeg','image/png','image/webp'].includes(mimeType)?'image':mimeType.startsWith('video/')?'video':'unknown';
  const video=kind==='video'&&mimeType==='video/mp4'&&/-video-[1-3]$/.test(text(row.slot));
  const blockedReason=video?(bytes!==null&&(bytes===0||bytes>45*1024*1024)?'Video vượt giới hạn xem hoặc không có dữ liệu.':row.has_data!==true&&row.has_cloud!==true&&row.has_object!==true?'Chưa đọc được nguồn video này.':null):kind!=='image'||/-video-[1-3]$/.test(text(row.slot))?'Định dạng chưa hỗ trợ xem trong ứng dụng.':
    bytes!==null&&(bytes===0||bytes>2*1024*1024)?'Ảnh vượt giới hạn xem hoặc không có dữ liệu.':
    row.has_data!==true&&row.has_cloud!==true?'Chưa đọc được nguồn ảnh này.':null;
  return{slot:text(row.slot),label:mediaPhotoLabel(target,text(row.slot)),revision:String(row.revision),mimeType,bytes,
    updatedAt:row.updated_at instanceof Date?row.updated_at.toISOString():new Date(String(row.updated_at)).toISOString(),kind,readable:blockedReason===null,blockedReason};
}
const photoSql='SELECT slot,xmin::text AS revision,mime_type,updated_at,octet_length(data) AS byte_count,'+
  '(data IS NOT NULL) AS has_data,(cloudinary_public_id IS NOT NULL AND cloudinary_cloud_name IS NOT NULL) AS has_cloud,(object_bucket IS NOT NULL AND object_key IS NOT NULL AND object_etag IS NOT NULL) AS has_object '+
  'FROM himoto.management_record_photos WHERE entity_type=$1 AND entity_id=$2';
export async function readMobileRecordMedia(user:SessionUser,raw:Params,request:NextRequest):Promise<MobileRecordMedia> {
  const target=parseMobileMediaTarget(raw);requireMedia(user,target);
  const p=request.nextUrl.searchParams,page=p.get('page')??'1';
  if([...p.keys()].some(k=>k!=='page'||p.getAll(k).length!==1)||!/^[1-9]\d{0,4}$/.test(page)||Number(page)>10000||request.headers.has('idempotency-key'))
    throw new MobileError('Trang media không hợp lệ; đọc hồ sơ không dùng mã ghi.',400,'INVALID_QUERY');
  return withMobileMedia(user,target,async db=>{
    const prepared=await readMediaTarget(db,target);
    const rows=(await db.query(photoSql+' AND slot ~ $3 ORDER BY slot COLLATE "C" LIMIT 26 OFFSET $4',
      [target.entity,target.id,mediaSlotPattern(target),(Number(page)-1)*25])).rows;
    const slots=defaultSlots(target);
    if(target.kind==='rental'){
      const keys=new Set<string>((await db.query('SELECT slot FROM himoto.management_record_photos WHERE entity_type=$1 AND entity_id=$2 AND slot ~ $3',[target.entity,target.id,mediaSlotPattern(target)])).rows.map(r=>String(r.slot)));
      for(const prefix of ['rental-','rental-document-','handover-','handover-document-']){
        let index=1;while(keys.has(prefix+index))index++;
        if(index>15&&index<=999999999999999)slots.push({slot:prefix+index,label:contractPhotoLabel(prefix+index),kind:'image'});
      }
      if(keys.has('rental-document-1')){
        let index=2;while(keys.has('rental-signed-'+index))index++;
        if(index<=999999999999999)slots.push({slot:'rental-signed-'+index,label:contractPhotoLabel('rental-signed-'+index),kind:'image'});
      }
    }
    const result:MobileRecordMedia={target:prepared,slots,page:Number(page),hasMore:rows.length>25,
      rows:rows.slice(0,25).map(row=>mapMediaPhoto(target,row)),observedAt:new Date().toISOString()};
    if(!isMobileRecordMedia(result))throw new MobileError('Media hồ sơ cần đối chiếu lại.',409,'MEDIA_REVIEW_REQUIRED');
    return result;
  });
}

export function parseMobileMediaImage(raw:Params,slot:string,request:NextRequest) {
  const target=parseMobileMediaTarget(raw),p=request.nextUrl.searchParams,revision=p.get('revision');
  if(!isMobileMediaSlot(target,slot))throw new MobileError('Ảnh không thuộc lượt ghi nhận này.',400,'INVALID_MEDIA_TARGET');
  parsePhotoTarget(target.entity,String(target.id),slot);
  if([...p.keys()].some(k=>k!=='revision'||p.getAll(k).length!==1)||!isMediaRevision(revision)||request.headers.has('idempotency-key'))
    throw new MobileError('Cần phiên bản ảnh chính xác để xem.',400,'INVALID_QUERY');
  if(/-video-[1-3]$/.test(photoBaseSlot(slot)))throw new MobileError('Video chưa hỗ trợ xem trong ứng dụng.',415,'UNSUPPORTED_MEDIA');
  return{target,slot,revision};
}
export async function readMobileRecordMediaImage(user:SessionUser,raw:Params,slot:string,request:NextRequest) {
  const query=parseMobileMediaImage(raw,slot,request);requireMedia(user,query.target);
  const image=await withMobileMedia(user,query.target,async db=>{
    await readMediaTarget(db,query.target);await requireContractPhotoSlot(db,query.target.entity,query.target.id,slot);
    const row=(await db.query(photoSql.replace('FROM himoto.management_record_photos',',data,cloudinary_public_id,cloudinary_cloud_name,cloudinary_version FROM himoto.management_record_photos')+
      ' AND slot=$3',[query.target.entity,query.target.id,slot])).rows[0];
    if(!row)throw new MobileError('Chưa có ảnh trong ô này.',404,'NOT_FOUND');
    const photo=mapMediaPhoto(query.target,row);
    if(photo.revision!==query.revision)throw new MobileError('Ảnh đã thay đổi. Tải lại hồ sơ trước khi xem.',409,'MEDIA_REVIEW_REQUIRED');
    if(!photo.readable)throw new MobileError(photo.blockedReason!,415,'UNSUPPORTED_MEDIA');
    return{row,photo};
  });
  let data:Uint8Array;
  if(image.row.data!=null)data=new Uint8Array(image.row.data);
  else{
    // Import outside the read-only DB transaction; no storage URL/redirect is
    // returned to a device carrying its Himoto bearer token.
    const {readCloudinaryPhoto}=await import('./cloudinary-photos');
    const remote=await readCloudinaryPhoto(image.row as {cloudinary_public_id:string;cloudinary_cloud_name:string;cloudinary_version:number;mime_type:string});
    const reader=remote.body?.getReader();
    if(!remote.ok||!reader)throw new MobileError('Chưa tải được ảnh. Thử lại.',503,'SERVICE_UNAVAILABLE');
    const chunks:Uint8Array[]=[];let length=0;
    try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;
      if(length>2*1024*1024){await reader.cancel();throw new MobileError('Ảnh vượt giới hạn xem trong ứng dụng.',413,'MEDIA_TOO_LARGE');}chunks.push(part.value);}}
    finally{reader.releaseLock();}
    data=new Uint8Array(Buffer.concat(chunks));
  }
  try{validatePhotoBytes(image.photo.mimeType,Buffer.from(data));}
  catch(error){if(error instanceof RecordPhotoError)throw new MobileError('Không đọc được ảnh đã lưu. Tải lại hồ sơ để kiểm tra.',409,'MEDIA_REVIEW_REQUIRED');throw error;}
  return{data,mimeType:image.photo.mimeType,revision:query.revision};
}
