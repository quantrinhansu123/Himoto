import 'server-only';
import type {PoolClient} from 'pg';
import type {NextRequest} from 'next/server';
import type {SessionUser} from './management-session';
import {MobileError} from './mobile-session';
import {parseMobileMediaTarget,withMobileMedia,readMediaTarget,mapMediaPhoto} from './mobile-record-media';
import {deleteRecordPhoto,requireContractPhotoSlot,parsePhotoTarget} from './record-photos';
import {mobileRequestKey,mobileBody,idempotentMobileWrite} from './mobile-writes';
import {isMediaRevision,isMobileMediaSlot,type MobileMediaEntity,type MobileMediaTarget} from '../../../shared/mobile-record-media';
import {mediaDeleteOperation,isMediaDeleteReceipt,type MobileMediaDeleteReceipt} from '../../../shared/mobile-media-delete';

type Params=Parameters<typeof parseMobileMediaTarget>[0];
const invalid=()=>new MobileError('Chưa xác nhận được phiếu xóa ảnh. Giữ mã để đối chiếu.',503,'INVALID_WRITE_RECEIPT');
const conflict=()=>new MobileError('Hồ sơ hoặc ảnh đã thay đổi. Đối chiếu lần trước rồi tải lại đúng ảnh cần xóa.',409,'MEDIA_DELETE_REVIEW_REQUIRED');
async function original(db:PoolClient,user:SessionUser,entity:MobileMediaEntity,id:number,key:string):Promise<MobileMediaDeleteReceipt|null>{
  const row=(await db.query('SELECT r.operation,r.resource_id,r.resource_revision,d.entity_type,d.entity_id,d.proof FROM himoto.management_mobile_requests r LEFT JOIN himoto.management_mobile_media_deletions d ON d.user_id=r.user_id AND d.request_id=r.request_id WHERE r.user_id=$1 AND r.request_id=$2',[user.id,key])).rows[0];
  if(!row||row.resource_id==null||row.operation!==mediaDeleteOperation(entity,id))return null;
  if(!isMediaDeleteReceipt(row.proof)||row.proof.actorId!==user.id||row.proof.requestId!==key||row.proof.target.entity!==entity||row.proof.id!==id||row.entity_type!==entity||Number(row.entity_id)!==id||Number(row.resource_id)!==id||row.resource_revision!==row.proof.revision)throw invalid();
  const target=row.proof.target as MobileMediaTarget,result:MobileMediaDeleteReceipt={...row.proof,replayed:true};
  const parent=(await db.query('SELECT xmin::text AS revision,'+(entity==='customers'?'NULL::timestamptz AS deleted_at':'deleted_at')+' FROM himoto.'+(entity==='customers'?'customers':entity==='contracts'?'orders':'vehicles')+' WHERE id=$1',[id])).rows[0];
  if(!parent)throw new MobileError('Hồ sơ đã ra ngoài phạm vi truy cập.',403,'FORBIDDEN');
  result.parentCurrent=parent.deleted_at==null&&parent.revision===target.revision;
  result.referenceCurrent=false;
  if(parent.deleted_at==null){
    try{const current=await readMediaTarget(db,target);result.referenceCurrent=current.referenceRevision===target.referenceRevision&&current.snapshot===target.snapshot;}
    catch(error){if(!(error instanceof MobileError&&error.status===404))throw error;}
  }
  result.slotEmpty=!(await db.query('SELECT slot FROM himoto.management_record_photos WHERE entity_type=$1 AND entity_id=$2 AND slot=$3',[entity,id,result.photo.slot])).rowCount;
  result.current=result.parentCurrent&&result.referenceCurrent&&result.slotEmpty;return result;
}
export async function deleteMobileRecordMedia(user:SessionUser,raw:Params,slot:string,request:NextRequest):Promise<MobileMediaDeleteReceipt>{
  const target=parseMobileMediaTarget(raw);if(!isMobileMediaSlot(target,slot))throw new MobileError('Ảnh không thuộc lượt ghi nhận đã chọn.',400,'INVALID_MEDIA_TARGET');
  parsePhotoTarget(target.entity,String(target.id),slot);
  const key=mobileRequestKey(request.headers.get('idempotency-key')),revision=request.headers.get('x-record-revision'),referenceRevision=request.headers.get('x-reference-revision'),snapshot=request.headers.get('x-media-snapshot'),photoRevision=request.headers.get('x-photo-revision');
  if(request.nextUrl.search||!isMediaRevision(revision)||!isMediaRevision(referenceRevision)||!isMediaRevision(photoRevision)||!snapshot||!/^[a-f0-9]{64}$/.test(snapshot)||Object.keys(await mobileBody(request,64)).length)
    throw new MobileError('Cần hồ sơ, lượt ghi nhận và ảnh đã rà soát trước khi xóa.',400,'INVALID_MEDIA_DELETE');
  // Web DELETE uses authenticated + scoped row locks and the photo slot domain,
  // independently of the permission for recording the corresponding transaction.
  return withMobileMedia(user,target,async db=>{
    const saved=await idempotentMobileWrite(db,user.id,key,mediaDeleteOperation(target.entity,target.id),{target,slot,revision,referenceRevision,snapshot,photoRevision},async()=>{
      const prepared=await readMediaTarget(db,target,true);if(prepared.revision!==revision||prepared.referenceRevision!==referenceRevision||prepared.snapshot!==snapshot)throw conflict();
      await requireContractPhotoSlot(db,target.entity,target.id,slot);
      const previous=(await db.query('SELECT slot,xmin::text AS revision,mime_type,updated_at,COALESCE(storage_bytes,octet_length(data)) AS byte_count,(data IS NOT NULL) AS has_data,(cloudinary_public_id IS NOT NULL AND cloudinary_cloud_name IS NOT NULL) AS has_cloud,(object_bucket IS NOT NULL AND object_key IS NOT NULL AND object_etag IS NOT NULL) AS has_object FROM himoto.management_record_photos WHERE entity_type=$1 AND entity_id=$2 AND slot=$3 FOR UPDATE',[target.entity,target.id,slot])).rows[0];
      if(!previous||previous.revision!==photoRevision)throw conflict();
      const photo=mapMediaPhoto(target,previous);
      await deleteRecordPhoto(db,target.entity,target.id,slot);
      const proof:MobileMediaDeleteReceipt={id:target.id,revision,requestId:key,replayed:false,target:prepared,photo,actorId:user.id,actorName:String(user.name??'').slice(0,4000),recordedAt:new Date().toISOString(),parentCurrent:true,referenceCurrent:true,slotEmpty:true,current:true};
      if(!isMediaDeleteReceipt(proof))throw invalid();
      await db.query('INSERT INTO himoto.management_mobile_media_deletions(user_id,request_id,entity_type,entity_id,proof) VALUES($1,$2,$3,$4,$5::jsonb)',[user.id,key,target.entity,target.id,JSON.stringify(proof)]);
      return{id:target.id,revision};
    });
    const receipt=await original(db,user,target.entity,target.id,key);if(!receipt||receipt.revision!==saved.revision)throw invalid();return{...receipt,replayed:saved.replayed};
  },true);
}
export async function readMediaDeleteReceipt(user:SessionUser,rawEntity:string,rawId:string,key:string){
  if(!['contracts','customers','vehicles'].includes(rawEntity)||!/^[1-9]\d{0,14}$/.test(rawId))throw new MobileError('Hồ sơ không hợp lệ.',400,'INVALID_MEDIA_TARGET');
  mobileRequestKey(key);const entity=rawEntity as MobileMediaEntity,id=Number(rawId);
  // A receipt may describe a slot/reference which has since been removed. Route
  // by the parent and verify the actor-owned original proof inside scoped SQL.
  const target=parseMobileMediaTarget({entity,id:rawId,kind:entity==='contracts'?'rental':entity==='customers'?'customer':'transfer',referenceId:entity==='vehicles'?'1':rawId});
  return withMobileMedia(user,target,async db=>({receipt:await original(db,user,entity,id,key)}));
}
