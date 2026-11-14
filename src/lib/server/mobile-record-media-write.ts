import 'server-only';
import {createHash} from 'node:crypto';
import type {NextRequest} from 'next/server';
import type {PoolClient} from 'pg';
import type {SessionUser} from './management-session';
import {himotoPool} from './himoto-database';
import {withMobileData} from './mobile-context';
import {MobileError} from './mobile-session';
import {mobileRequestKey,idempotentMobileWrite} from './mobile-writes';
import {parseMobileMediaTarget,requireMobileMediaWrite,readMediaTarget,readMediaReference,withMobileMedia,mediaPhotoLabel} from './mobile-record-media';
import {parsePhotoTarget,requireContractPhotoSlot,validatePhotoBytes,writeRecordPhoto,RecordPhotoError} from './record-photos';
import {isMediaRevision,isMobileMediaSlot,isMobileMediaReceipt,mediaOperation,type MobileMediaReceipt} from '../../../shared/mobile-record-media';
import {cloudflyPhotosEnabled,storeObjectPhoto} from './object-media';

const digest=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
const invalid=()=>new MobileError('Chưa xác nhận được phiếu lưu ảnh. Giữ mã để đối chiếu.',503,'INVALID_WRITE_RECEIPT');
const conflict=()=>new MobileError('Hồ sơ, lượt ghi nhận hoặc ảnh đã thay đổi. Đối chiếu và tải lại trước khi lưu.',409,'MEDIA_REVIEW_REQUIRED');
type Params=Parameters<typeof parseMobileMediaTarget>[0];
async function imageBytes(request:NextRequest) {
  if(request.headers.get('content-type')!=='image/jpeg')throw new MobileError('Cần ảnh JPEG đã chuẩn bị.',415,'INVALID_MEDIA');
  const size=request.headers.get('content-length');
  if(size!==null&&(!/^\d+$/.test(size)||Number(size)>2*1024*1024))throw new MobileError('Mỗi ảnh tối đa 2 MB.',413,'MEDIA_TOO_LARGE');
  const reader=request.body?.getReader();if(!reader)throw new MobileError('Chưa có ảnh cần lưu.',400,'INVALID_MEDIA');
  const chunks:Uint8Array[]=[];let length=0;
  try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;
    if(length>2*1024*1024){await reader.cancel();throw new MobileError('Mỗi ảnh tối đa 2 MB.',413,'MEDIA_TOO_LARGE');}chunks.push(part.value);}}
  finally{reader.releaseLock();}
  const data=Buffer.concat(chunks);
  try{validatePhotoBytes('image/jpeg',data);}catch(error){if(error instanceof RecordPhotoError)throw new MobileError(error.message,error.status,'INVALID_MEDIA');throw error;}
  return data;
}
async function original(db:PoolClient,user:SessionUser,key:string):Promise<MobileMediaReceipt|null> {
  const row=(await db.query('SELECT r.operation,r.resource_id,r.resource_revision,m.entity_type,m.entity_id,m.proof FROM himoto.management_mobile_requests r '+
    'LEFT JOIN himoto.management_mobile_record_media m ON m.user_id=r.user_id AND m.request_id=r.request_id WHERE r.user_id=$1 AND r.request_id=$2',[user.id,key])).rows[0];
  if(!row||row.resource_id==null||!String(row.operation).startsWith('media.'))return null;
  if(!isMobileMediaReceipt(row.proof)||row.proof.requestId!==key||row.proof.actorId!==user.id||row.proof.id!==Number(row.resource_id)||row.proof.revision!==row.resource_revision||
    row.entity_type!==row.proof.target.entity||Number(row.entity_id)!==row.proof.id||row.operation!==mediaOperation(row.proof.target.entity,row.proof.id))throw invalid();
  const result:MobileMediaReceipt={...row.proof,replayed:true},target=result.target;
  requireMobileMediaWrite(user,target,result.slot);
  const parent=(await db.query('SELECT xmin::text AS revision,'+(target.entity==='customers'?'NULL::timestamptz AS deleted_at':'deleted_at')+' FROM himoto.'+(target.entity==='customers'?'customers':target.entity==='contracts'?'orders':'vehicles')+' WHERE id=$1',[target.id])).rows[0];
  if(!parent)throw new MobileError('Hồ sơ đã ra ngoài phạm vi hiện tại.',403,'FORBIDDEN');
  result.parentCurrent=parent.deleted_at==null&&parent.revision===target.revision;
  const ref=await readMediaReference(db,target,parent);
  result.referenceCurrent=!!ref&&ref.deleted_at==null&&ref.revision===target.referenceRevision;
  if(result.parentCurrent&&result.referenceCurrent&&target.snapshot)result.referenceCurrent=(await readMediaTarget(db,target)).snapshot===target.snapshot;
  const photo=(await db.query('SELECT xmin::text AS revision,mime_type,data,storage_sha256 FROM himoto.management_record_photos WHERE entity_type=$1 AND entity_id=$2 AND slot=$3',[target.entity,target.id,result.slot])).rows[0];
  result.photoCurrent=!!photo&&photo.revision===result.photoRevision&&photo.mime_type==='image/jpeg'&&(photo.data!=null?digest(photo.data):photo.storage_sha256)===result.sha256;
  result.current=result.parentCurrent&&result.referenceCurrent&&result.photoCurrent;return result;
}
export async function readMobileMediaReceipt(user:SessionUser,key:string) {
  mobileRequestKey(key);
  // Discover actor-owned routing metadata only. It is not a substitute for the
  // second transaction's current parent/slot visibility and permission checks.
  const target=await withMobileData(user,'',async()=>{
    const row=(await himotoPool.query('SELECT entity_type,entity_id,proof FROM himoto.management_mobile_record_media WHERE user_id=$1 AND request_id=$2',[user.id,key])).rows[0];
    if(!row)return null;
    if(!isMobileMediaReceipt(row.proof)||row.proof.requestId!==key||row.proof.actorId!==user.id||row.entity_type!==row.proof.target.entity||Number(row.entity_id)!==row.proof.id)throw invalid();
    return row.proof.target;
  });
  if(!target)return{receipt:null};
  return withMobileMedia(user,target,async db=>({receipt:await original(db,user,key)}));
}
export async function uploadMobileRecordMedia(user:SessionUser,raw:Params,slot:string,request:NextRequest):Promise<MobileMediaReceipt> {
  const target=parseMobileMediaTarget(raw);requireMobileMediaWrite(user,target,slot);
  if(!isMobileMediaSlot(target,slot)||/-video-[1-3]$/.test(slot))throw new MobileError('Chỉ lưu ảnh vào đúng ô của lượt ghi nhận này.',400,'INVALID_MEDIA_TARGET');
  parsePhotoTarget(target.entity,String(target.id),slot);
  const key=mobileRequestKey(request.headers.get('idempotency-key')),revision=request.headers.get('x-record-revision'),referenceRevision=request.headers.get('x-reference-revision'),expected=request.headers.get('x-photo-revision'),snapshot=request.headers.get('x-media-snapshot');
  if(request.nextUrl.search||!isMediaRevision(revision)||!isMediaRevision(referenceRevision)||!(expected==='0'||isMediaRevision(expected))||!snapshot||!/^[a-f0-9]{64}$/.test(snapshot))
    throw new MobileError('Cần phiên bản hồ sơ, lượt ghi nhận và ảnh đã rà soát.',400,'INVALID_MEDIA');
  const data=await imageBytes(request),sha256=digest(data);
  const storedPhoto=cloudflyPhotosEnabled()?await storeObjectPhoto(data,'image/jpeg',user.id,key):undefined;
  return withMobileMedia(user,target,async db=>{
    const saved=await idempotentMobileWrite(db,user.id,key,mediaOperation(target.entity,target.id),{target,slot,revision,referenceRevision,expected,snapshot,sha256,bytes:data.length},async()=>{
      const prepared=await readMediaTarget(db,target,true);
      if(prepared.revision!==revision||prepared.referenceRevision!==referenceRevision||prepared.snapshot!==snapshot)throw conflict();
      await requireContractPhotoSlot(db,target.entity,target.id,slot);
      const previous=(await db.query('SELECT xmin::text AS revision FROM himoto.management_record_photos WHERE entity_type=$1 AND entity_id=$2 AND slot=$3 FOR UPDATE',[target.entity,target.id,slot])).rows[0];
      if((previous?.revision??'0')!==expected)throw conflict();
      await writeRecordPhoto(db,target.entity,target.id,slot,'image/jpeg',data,user.id,storedPhoto);
      const stored=(await db.query('SELECT xmin::text AS revision,updated_at,data,storage_sha256 FROM himoto.management_record_photos WHERE entity_type=$1 AND entity_id=$2 AND slot=$3',[target.entity,target.id,slot])).rows[0];
      if(!stored||(stored.data!=null?digest(stored.data):stored.storage_sha256)!==sha256)throw invalid();
      const proof:MobileMediaReceipt={id:target.id,revision,requestId:key,replayed:false,target:prepared,slot,label:mediaPhotoLabel(target,slot),photoRevision:stored.revision,sha256,bytes:data.length,
        actorId:user.id,actorName:String(user.name??'').slice(0,4000),recordedAt:new Date(stored.updated_at).toISOString(),parentCurrent:true,referenceCurrent:true,photoCurrent:true,current:true};
      if(!isMobileMediaReceipt(proof))throw invalid();
      await db.query('INSERT INTO himoto.management_mobile_record_media(user_id,request_id,entity_type,entity_id,proof) VALUES($1,$2,$3,$4,$5::jsonb)',[user.id,key,target.entity,target.id,JSON.stringify(proof)]);
      return{id:target.id,revision};
    });
    const receipt=await original(db,user,key);if(!receipt||receipt.id!==saved.id||receipt.revision!==saved.revision)throw invalid();
    return{...receipt,replayed:saved.replayed};
  },true);
}
