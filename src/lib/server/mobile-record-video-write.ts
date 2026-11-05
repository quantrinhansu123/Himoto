import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { NextRequest } from 'next/server';
import type { SessionUser } from './management-session';
import { himotoPool } from './himoto-database';
import { withMobileData } from './mobile-context';
import { MobileError } from './mobile-session';
import { mobileBody, mobileRequestKey, idempotentMobileWrite } from './mobile-writes';
import { parseMobileMediaTarget, requireMobileMediaWrite, readMediaTarget, readMediaReference, withMobileMedia, mediaPhotoLabel } from './mobile-record-media';
import { requireContractPhotoSlot, RecordPhotoError } from './record-photos';
import { signPhotoUpload, verifyPhotoReceipt, writeCloudinaryPhoto, cleanupConvertedVideo, type CloudPhotoReceipt } from './cloudinary-photos';
import { browserVideosEnabled, signBrowserVideo, completeBrowserVideo, verifyBrowserVideoReceipt, writeBrowserVideoPhoto, BrowserVideoCompatibilityError } from './browser-videos';
import { cloudflyVideosEnabled } from './cloudfly-videos';
import { isMediaRevision, isMobileMediaSlot } from '../../../shared/mobile-record-media';
import { isMobileVideoReceipt, isMobileVideoCloudReceipt, isMobileVideoSignature, videoOperation, type MobileVideoReceipt } from '../../../shared/mobile-video';
import { isMobileVideoBrowserReceipt, isMobileVideoDirectResult, validMobileDirectVideoBytes, type MobileVideoBrowserReceipt } from '../../../shared/mobile-video-upload';

type Params = Parameters<typeof parseMobileMediaTarget>[0];
const invalid = () => new MobileError('Chưa xác nhận được phiếu video. Giữ mã để đối chiếu.', 503, 'INVALID_WRITE_RECEIPT');
const conflict = () => new MobileError('Hồ sơ hoặc video đã thay đổi. Tải lại và rà soát trước khi lưu.', 409, 'MEDIA_REVIEW_REQUIRED');
const columns = 'xmin::text AS revision,mime_type,cloudinary_public_id,cloudinary_cloud_name,cloudinary_version,object_bucket,object_key,object_etag,updated_at';
export const videoAssetHash = (row: Record<string, unknown>) => createHash('sha256').update(JSON.stringify(['mime_type','cloudinary_public_id','cloudinary_cloud_name','cloudinary_version','object_bucket','object_key','object_etag'].map(k => row[k] ?? null))).digest('hex');
function videoTarget(user: SessionUser, raw: Params, slot: string) {
  const target = parseMobileMediaTarget(raw);
  if (target.entity !== 'contracts' || !isMobileMediaSlot(target, slot) || !/-video-[1-3]$/.test(slot)) throw new MobileError('Chọn đúng ô video của hợp đồng.', 400, 'INVALID_MEDIA_TARGET');
  requireMobileMediaWrite(user, target, slot); return target;
}
function reviewed(request: NextRequest) {
  const revision = request.headers.get('x-record-revision'), referenceRevision = request.headers.get('x-reference-revision'), expected = request.headers.get('x-photo-revision'), snapshot = request.headers.get('x-media-snapshot');
  if (request.nextUrl.search || !isMediaRevision(revision) || !isMediaRevision(referenceRevision) || !(expected === '0' || isMediaRevision(expected)) || !snapshot || !/^[a-f0-9]{64}$/.test(snapshot)) throw new MobileError('Cần phiên bản hồ sơ, lượt ghi nhận và video đã rà soát.', 400, 'INVALID_MEDIA');
  return { revision, referenceRevision, expected, snapshot };
}
async function reviewUpload(user:SessionUser,target:ReturnType<typeof videoTarget>,slot:string,review:ReturnType<typeof reviewed>,key:string) {
  await withMobileMedia(user, target, async db => {
    const prepared = await readMediaTarget(db, target);
    if (prepared.revision !== review.revision || prepared.referenceRevision !== review.referenceRevision || prepared.snapshot !== review.snapshot) throw conflict();
    await requireContractPhotoSlot(db, target.entity, target.id, slot);
    const photo = (await db.query('SELECT xmin::text AS revision FROM himoto.management_record_photos WHERE entity_type=$1 AND entity_id=$2 AND slot=$3', [target.entity,target.id,slot])).rows[0];
    if ((photo?.revision ?? '0') !== review.expected) throw conflict();
    const prior = (await db.query('SELECT operation FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2', [user.id,key])).rows[0];
    if (prior) throw new MobileError('Mã này đã được xử lý. Đối chiếu trước khi tải video mới.', 409, 'REQUEST_KEY_REUSED');
  });
}
export async function signMobileRecordVideo(user: SessionUser, raw: Params, slot: string, request: NextRequest) {
  const target = videoTarget(user, raw, slot), review = reviewed(request), body = await mobileBody(request, 1024);
  if (Object.keys(body).some(k => k !== 'uploadId')) throw new MobileError('Thông tin tải video chưa hợp lệ.');
  const key = mobileRequestKey(typeof body.uploadId === 'string' ? body.uploadId : null);
  if (request.headers.get('idempotency-key') !== key) throw new MobileError('Mã tải video không khớp.');
  await reviewUpload(user,target,slot,review,key);
  let result;
  try { result = { ...signPhotoUpload(user.id,key,Date.now(),true), video_storage_provider: cloudflyVideosEnabled() ? 'cloudfly' as const : 'cloudinary' as const }; }
  catch(error) { if(error instanceof RecordPhotoError) throw new MobileError(error.message,error.status,'VIDEO_UNAVAILABLE'); throw error; }
  if (!isMobileVideoSignature(result)) throw new MobileError('Cấu hình tải video chưa hợp lệ.',503,'VIDEO_UNAVAILABLE');
  return result;
}
export async function directMobileRecordVideo(user:SessionUser,raw:Params,slot:string,request:NextRequest) {
  const target=videoTarget(user,raw,slot),review=reviewed(request),body=await mobileBody(request,2048),key=mobileRequestKey(request.headers.get('idempotency-key'));
  const fields=body.action==='config'?['action','uploadId']:body.action==='sign'?['action','uploadId','bytes','sha256']:body.action==='verify'?['action','uploadId','ticket']:[];
  if(!fields.length||Object.keys(body).some(k=>!fields.includes(k))||body.uploadId!==key||body.action==='sign'&&(!validMobileDirectVideoBytes(body.bytes)||typeof body.sha256!=='string'||!/^[a-f0-9]{64}$/.test(body.sha256)))throw new MobileError('Thông tin tải video trực tiếp chưa hợp lệ.',400,'INVALID_VIDEO');
  await reviewUpload(user,target,slot,review,key);
  try {
    if(body.action==='config')return{direct:browserVideosEnabled()};
    if(body.action==='sign') {
      const result=await signBrowserVideo(user.id,{upload_id:key,bytes:body.bytes,sha256:body.sha256,max_duration:60});
      if(!isMobileVideoDirectResult(result,user.id,key,String(body.sha256)))throw new MobileError('Chưa xác nhận được nơi tải video.',503,'INVALID_VIDEO_UPLOAD');
      return result;
    }
    const result=await completeBrowserVideo(user.id,body.ticket,Date.now(),{uploadId:key,maxDuration:60});
    if(!isMobileVideoBrowserReceipt(result.receipt)||result.receipt.upload_id!==key)throw invalid();
    return result;
  }catch(error) {
    if(error instanceof BrowserVideoCompatibilityError)throw new MobileError(error.message,error.status,'VIDEO_CONVERSION_REQUIRED');
    if(error instanceof RecordPhotoError)throw new MobileError(error.message,error.status,'DIRECT_VIDEO_UNAVAILABLE');throw error;
  }
}
async function original(db: PoolClient, user: SessionUser, key: string): Promise<MobileVideoReceipt | null> {
  const row = (await db.query('SELECT r.operation,r.resource_id,r.resource_revision,m.entity_type,m.entity_id,m.proof FROM himoto.management_mobile_requests r LEFT JOIN himoto.management_mobile_record_media m ON m.user_id=r.user_id AND m.request_id=r.request_id WHERE r.user_id=$1 AND r.request_id=$2', [user.id,key])).rows[0];
  if (!row || row.resource_id == null || !String(row.operation).startsWith('video.record:')) return null;
  if (!isMobileVideoReceipt(row.proof) || row.proof.requestId !== key || row.proof.actorId !== user.id || row.operation !== videoOperation(row.proof.id) || row.proof.id !== Number(row.resource_id) || row.proof.revision !== row.resource_revision || row.entity_type !== 'contracts' || Number(row.entity_id) !== row.proof.id) throw invalid();
  const receipt: MobileVideoReceipt = { ...row.proof, replayed:true }, target = receipt.target;
  requireMobileMediaWrite(user,target,receipt.slot);
  const parent = (await db.query('SELECT xmin::text AS revision,deleted_at FROM himoto.orders WHERE id=$1',[target.id])).rows[0];
  if (!parent) throw new MobileError('Hồ sơ đã ra ngoài phạm vi hiện tại.',403,'FORBIDDEN');
  receipt.parentCurrent = parent.deleted_at == null && parent.revision === target.revision;
  const ref = await readMediaReference(db,target,parent);
  receipt.referenceCurrent = !!ref && ref.deleted_at == null && ref.revision === target.referenceRevision;
  if (receipt.parentCurrent && receipt.referenceCurrent) receipt.referenceCurrent = (await readMediaTarget(db,target)).snapshot === target.snapshot;
  const photo = (await db.query(`SELECT ${columns} FROM himoto.management_record_photos WHERE entity_type='contracts' AND entity_id=$1 AND slot=$2`,[target.id,receipt.slot])).rows[0];
  receipt.photoCurrent = !!photo && photo.revision === receipt.photoRevision && photo.mime_type === 'video/mp4' && videoAssetHash(photo) === receipt.assetHash;
  receipt.current = receipt.parentCurrent && receipt.referenceCurrent && receipt.photoCurrent; return receipt;
}
export async function readMobileVideoReceipt(user: SessionUser, key: string) {
  mobileRequestKey(key);
  const target = await withMobileData(user,'',async () => {
    const row = (await himotoPool.query('SELECT entity_type,entity_id,proof FROM himoto.management_mobile_record_media WHERE user_id=$1 AND request_id=$2',[user.id,key])).rows[0];
    if (!row) return null;
    if (!isMobileVideoReceipt(row.proof) || row.proof.requestId !== key || row.proof.actorId !== user.id || row.entity_type !== 'contracts' || Number(row.entity_id) !== row.proof.id) throw invalid();
    return row.proof.target;
  });
  return target ? withMobileMedia(user,target,async db => ({ receipt:await original(db,user,key) })) : { receipt:null };
}
export async function uploadMobileRecordVideo(user: SessionUser, raw: Params, slot: string, request: NextRequest): Promise<MobileVideoReceipt> {
  const target = videoTarget(user,raw,slot), review = reviewed(request), key = mobileRequestKey(request.headers.get('idempotency-key')), body = await mobileBody(request,2048);
  if (!isMobileVideoCloudReceipt(body)&&!isMobileVideoBrowserReceipt(body)) throw new MobileError('Cần kết quả tải video có chữ ký hợp lệ.',400,'INVALID_VIDEO');
  let cloud:CloudPhotoReceipt|MobileVideoBrowserReceipt;
  try {
    if(isMobileVideoBrowserReceipt(body)){const direct=verifyBrowserVideoReceipt(body,user.id);cloud={provider:'cloudfly-browser',resource_type:'video',upload_id:direct.upload_id,signature:direct.signature};}
    else cloud = verifyPhotoReceipt(body,user.id);
  }
  catch(error) { if(error instanceof RecordPhotoError) throw new MobileError(error.message,error.status,'INVALID_VIDEO'); throw error; }
  if (isMobileVideoBrowserReceipt(cloud)?cloud.upload_id!==key:cloud.public_id !== `himoto/management-video/${user.id}/${key}`) throw new MobileError('Video không khớp mã lần lưu.',400,'INVALID_VIDEO');
  const receipt = await withMobileMedia(user,target,async db => {
    const saved = await idempotentMobileWrite(db,user.id,key,videoOperation(target.id),{ target,slot,...review,cloud },async () => {
      const prepared = await readMediaTarget(db,target,true);
      if (prepared.revision !== review.revision || prepared.referenceRevision !== review.referenceRevision || prepared.snapshot !== review.snapshot) throw conflict();
      await requireContractPhotoSlot(db,target.entity,target.id,slot);
      const previous = (await db.query('SELECT xmin::text AS revision FROM himoto.management_record_photos WHERE entity_type=$1 AND entity_id=$2 AND slot=$3 FOR UPDATE',[target.entity,target.id,slot])).rows[0];
      if ((previous?.revision ?? '0') !== review.expected) throw conflict();
      const details = isMobileVideoBrowserReceipt(cloud)?await writeBrowserVideoPhoto(db,target.entity,target.id,slot,user.id,cloud):await writeCloudinaryPhoto(db,target.entity,target.id,slot,user.id,cloud);
      if (!details) throw invalid();
      const stored = (await db.query(`SELECT ${columns} FROM himoto.management_record_photos WHERE entity_type=$1 AND entity_id=$2 AND slot=$3`,[target.entity,target.id,slot])).rows[0];
      if (!stored || stored.mime_type !== 'video/mp4') throw invalid();
      if('object_key' in details&&'object_bucket' in details&&'object_etag' in details) { if(stored.object_key!==details.object_key||stored.object_bucket!==details.object_bucket||stored.object_etag!==details.object_etag)throw invalid(); }
      else if(isMobileVideoBrowserReceipt(cloud)||stored.cloudinary_public_id!==cloud.public_id||Number(stored.cloudinary_version)!==cloud.version)throw invalid();
      const proof: MobileVideoReceipt = { kind:'video',id:target.id,revision:review.revision,requestId:key,replayed:false,target:prepared,slot,label:mediaPhotoLabel(target,slot),photoRevision:stored.revision,assetHash:videoAssetHash(stored),bytes:details.bytes,duration:details.duration,actorId:user.id,actorName:String(user.name ?? '').slice(0,4000),recordedAt:new Date(stored.updated_at).toISOString(),parentCurrent:true,referenceCurrent:true,photoCurrent:true,current:true };
      if (!isMobileVideoReceipt(proof)) throw invalid();
      await db.query('INSERT INTO himoto.management_mobile_record_media(user_id,request_id,entity_type,entity_id,proof) VALUES($1,$2,$3,$4,$5::jsonb)',[user.id,key,target.entity,target.id,JSON.stringify(proof)]);
      return { id:target.id,revision:review.revision };
    });
    const result = await original(db,user,key); if (!result || result.id !== saved.id || result.revision !== saved.revision) throw invalid(); return { ...result,replayed:saved.replayed };
  },true);
  if(!isMobileVideoBrowserReceipt(cloud))await cleanupConvertedVideo(cloud); // Only after COMMIT; direct uploads have no conversion to remove.
  return receipt;
}
