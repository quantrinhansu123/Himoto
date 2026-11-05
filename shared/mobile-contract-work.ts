import type {MobileDraftInput,MobileWriteReceipt} from './mobile-contract';
import {isMobileDraftInput} from './mobile-draft-validation';
import {isMediaRevision,isMobileMediaSlotInfo,isMobileMediaReceipt,matchesMobileMediaTarget,type MobileMediaSlotInfo,type MobileMediaReceipt} from './mobile-record-media';
import {isCustomerPhotoCopyReview,isCustomerPhotoCopyReceipt,type MobileCustomerPhotoCopyReview,type MobileCustomerPhotoCopyReceipt} from './mobile-customer-photo-copy';
import {orderContractPhotoUploads} from './mobile-contract-photo-order';

export interface ContractWorkScope {origin:string;userId:number;storeId:number|null;allStores:boolean}
export interface ContractWorkPhoto {id:string;fileId:string;slot:string;sha256:string;bytes:number;width:number;height:number;mimeType:'image/jpeg';discarded:boolean}
type AttemptState='planned'|'committed'|'cancelled';
interface AttemptBase {key:string;operation:string;state:AttemptState;acknowledged:boolean}
export type ContractWorkAttempt=AttemptBase&(
  {kind:'metadata';input:MobileDraftInput;receipt:MobileWriteReceipt|null}|
  {kind:'photo';photoId:string;review:MobileMediaSlotInfo;receipt:MobileMediaReceipt|null}|
  {kind:'copy';review:MobileCustomerPhotoCopyReview;receipt:MobileCustomerPhotoCopyReceipt|null}
);
export interface ContractWork {
  version:1;id:string;scope:ContractWorkScope;baseDraftId:number|null;contractId:number|null;
  input:MobileDraftInput;step:number;photos:ContractWorkPhoto[];attempts:ContractWorkAttempt[];
  status:'open'|'finished'|'discarded';createdAt:number;updatedAt:number;
}
export type ContractWorkCommand=
  {type:'edit';input:MobileDraftInput;step:number}|
  {type:'add-photo';photo:ContractWorkPhoto}|
  {type:'bind-photo';photoId:string;slot:string}|
  {type:'remove-photo';photoId:string}|
  {type:'plan-metadata';key:string}|
  {type:'plan-photo';key:string;photoId:string;review:MobileMediaSlotInfo}|
  {type:'plan-copy';key:string;review:MobileCustomerPhotoCopyReview}|
  {type:'committed';key:string;receipt:MobileWriteReceipt|MobileMediaReceipt|MobileCustomerPhotoCopyReceipt}|
  {type:'cancelled';key:string}|
  {type:'acknowledge';key:string}|
  {type:'finish'|'discard'};

export class ContractWorkRuleError extends Error { constructor(message:string){super(message);this.name='ContractWorkRuleError';} }
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const only=(v:unknown,keys:readonly string[])=>object(v)&&Object.keys(v).every(k=>keys.includes(k));
const targetKeys=['entity','id','kind','referenceId','revision','referenceRevision','label','snapshot','canWrite'];
const photoKeys=['slot','label','revision','mimeType','bytes','updatedAt','kind','readable','blockedReason'];
const writeKeys=['id','revision','replayed'];
function closedReview(v:MobileMediaSlotInfo){return only(v,['target','slot','label','photo','nextSlot','observedAt'])&&only(v.target,targetKeys)&&(v.photo===null||only(v.photo,photoKeys));}
function closedPhotoReceipt(v:MobileMediaReceipt){return only(v,[...writeKeys,'requestId','target','slot','label','photoRevision','sha256','bytes','actorId','actorName','recordedAt','parentCurrent','referenceCurrent','photoCurrent','current'])&&only(v.target,targetKeys);}
const copyReviewKeys=['id','revision','customerId','sourceCount','missingCount','presentCount','snapshot','observedAt'];
const copyReceiptKeys=[...writeKeys,'requestId','customerId','copied','sourceCount','presentCount','resultSnapshot','actorId','actorName','recordedAt','parentCurrent','photosCurrent','current'];
export const isWorkUuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
export const isWorkDigest=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=999999999999999;
const receipt=(v:unknown):v is MobileWriteReceipt=>object(v)&&exact(v,writeKeys)&&id(v.id)&&isMediaRevision(v.revision)&&typeof v.replayed==='boolean';
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v)) as T;
export function isContractWorkScope(v:unknown):v is ContractWorkScope {
  if(!object(v)||!exact(v,['origin','userId','storeId','allStores'])||typeof v.origin!=='string'||v.origin.length>512||!id(v.userId)||!(v.storeId===null||id(v.storeId))||typeof v.allStores!=='boolean'||v.allStores&&v.storeId!==null)return false;
  try{const url=new URL(v.origin);return ['https:','http:'].includes(url.protocol)&&url.origin===v.origin;}catch{return false;}
}
export const sameWorkActor=(a:ContractWorkScope,b:ContractWorkScope)=>a.origin===b.origin&&a.userId===b.userId;
export const sameWorkScope=(a:ContractWorkScope,b:ContractWorkScope)=>sameWorkActor(a,b)&&a.storeId===b.storeId&&a.allStores===b.allStores;
export function isContractWorkPhoto(v:unknown):v is ContractWorkPhoto {
  return object(v)&&exact(v,['id','fileId','slot','sha256','bytes','width','height','mimeType','discarded'])&&isWorkUuid(v.id)&&v.fileId===v.id&&typeof v.slot==='string'&&/^(?:scan_plate|plate-[1-9]\d{0,14}|customer-id-front|customer-id-back|customer-driver-license|driver-license|rental-(?:[1-9]\d{0,14}|document-[1-9]\d{0,14}|signed-[1-9]\d{0,14})|handover-(?:[1-9]\d{0,14}|document-[1-9]\d{0,14}))(?:-extra-(?:[2-9]|[1-9]\d{1,14}))?$/.test(v.slot)&&isWorkDigest(v.sha256)&&id(v.bytes)&&v.bytes<=2*1024*1024&&id(v.width)&&v.width<=2200&&id(v.height)&&v.height<=2200&&v.mimeType==='image/jpeg'&&typeof v.discarded==='boolean';
}
function photoReceiptMatches(a:Extract<ContractWorkAttempt,{kind:'photo'}>,proof:MobileMediaReceipt,work:ContractWork){
  const photo=work.photos.find(p=>p.id===a.photoId),review=a.review;
  return !!photo&&isMobileMediaReceipt(proof)&&closedPhotoReceipt(proof)&&proof.requestId===a.key&&proof.actorId===work.scope.userId&&proof.id===work.contractId&&matchesMobileMediaTarget(proof.target,review.target)&&proof.target.revision===review.target.revision&&proof.target.referenceRevision===review.target.referenceRevision&&proof.target.snapshot===review.target.snapshot&&proof.slot===review.slot&&proof.sha256===photo.sha256&&proof.bytes===photo.bytes;
}
function copyReceiptMatches(a:Extract<ContractWorkAttempt,{kind:'copy'}>,proof:MobileCustomerPhotoCopyReceipt,work:ContractWork){
  return isCustomerPhotoCopyReceipt(proof)&&only(proof,copyReceiptKeys)&&proof.requestId===a.key&&proof.actorId===work.scope.userId&&proof.id===work.contractId&&proof.revision===a.review.revision&&proof.customerId===a.review.customerId&&proof.sourceCount===a.review.sourceCount&&proof.presentCount===a.review.presentCount&&proof.copied===a.review.missingCount;
}
function validAttempt(v:unknown,work:ContractWork):v is ContractWorkAttempt {
  if(!object(v)||!isWorkUuid(v.key)||!['planned','committed','cancelled'].includes(String(v.state))||typeof v.acknowledged!=='boolean'||v.state==='planned'&&v.acknowledged||v.state!=='committed'&&v.receipt!==null)return false;
  const keys=['key','operation','state','acknowledged','kind','receipt'];
  if(v.kind==='metadata')return exact(v,[...keys,'input'])&&v.operation===(work.baseDraftId===null?'draft.create':`draft.update:${work.baseDraftId}`)&&isMobileDraftInput(v.input)&&(v.state!=='committed'||receipt(v.receipt)&&(work.baseDraftId===null||v.receipt.id===work.baseDraftId)&&v.receipt.id===work.contractId);
  if(v.kind==='photo'){
    if(!exact(v,[...keys,'photoId','review'])||!isWorkUuid(v.photoId)||!isMobileMediaSlotInfo(v.review)||!closedReview(v.review)||v.operation!==`media.contract:${work.contractId}`||v.review.target.entity!=='contracts'||v.review.target.id!==work.contractId)return false;
    const photo=work.photos.find(p=>p.id===v.photoId);if(!photo||v.state!=='cancelled'&&(photo.discarded||photo.slot!==v.review.slot))return false;
    const plate=/^plate-([1-9]\d*)(?:-extra-\d+)?$/.exec(v.review.slot);
    if(v.review.target.kind!==(plate?'plate':'rental')||v.review.target.referenceId!==(plate?Number(plate[1]):work.contractId))return false;
    return v.state!=='committed'||photoReceiptMatches(v as unknown as Extract<ContractWorkAttempt,{kind:'photo'}>,v.receipt as MobileMediaReceipt,work);
  }
  if(v.kind==='copy')return exact(v,[...keys,'review'])&&isCustomerPhotoCopyReview(v.review)&&only(v.review,copyReviewKeys)&&v.operation===`media.copy:${work.contractId}`&&v.review.id===work.contractId&&v.review.customerId===work.input.draft.customer_id&&(v.state!=='committed'||copyReceiptMatches(v as unknown as Extract<ContractWorkAttempt,{kind:'copy'}>,v.receipt as MobileCustomerPhotoCopyReceipt,work));
  return false;
}
export function isContractWork(v:unknown):v is ContractWork {
  if(!object(v)||!exact(v,['version','id','scope','baseDraftId','contractId','input','step','photos','attempts','status','createdAt','updatedAt'])||v.version!==1||!isWorkUuid(v.id)||!isContractWorkScope(v.scope)||!(v.baseDraftId===null||id(v.baseDraftId))||!(v.contractId===null||id(v.contractId))||!isMobileDraftInput(v.input)||!Number.isInteger(v.step)||Number(v.step)<0||Number(v.step)>4||!Array.isArray(v.photos)||!v.photos.every(isContractWorkPhoto)||new Set(v.photos.map(p=>p.id)).size!==v.photos.length||new Set(v.photos.filter(p=>!p.discarded).map(p=>p.slot)).size!==v.photos.filter(p=>!p.discarded).length||!Array.isArray(v.attempts)||!['open','finished','discarded'].includes(String(v.status))||!id(v.createdAt)||!id(v.updatedAt))return false;
  const work=v as unknown as ContractWork;
  if(!work.attempts.every(a=>validAttempt(a,work))||new Set(work.attempts.map(a=>a.key)).size!==work.attempts.length||work.attempts.filter(a=>a.state==='planned'||!a.acknowledged).length>1)return false;
  const metadata=work.attempts.filter(a=>a.kind==='metadata'&&a.state==='committed');
  if(metadata.length>1||work.contractId!==null&&metadata.length!==1||work.contractId===null&&work.attempts.some(a=>a.kind!=='metadata')||metadata.some(a=>a.kind==='metadata'&&!same(a.input,work.input)))return false;
  const committedPhotos=work.attempts.filter(a=>a.kind==='photo'&&a.state==='committed');
  if(new Set(committedPhotos.map(a=>a.kind==='photo'?a.photoId:'')).size!==committedPhotos.length||work.attempts.filter(a=>a.kind==='copy'&&a.state==='committed').length>1)return false;
  if(work.status!=='open'&&work.attempts.some(a=>a.state==='planned'||!a.acknowledged))return false;
  if(work.status==='finished'&&(work.contractId===null||work.photos.some(p=>!p.discarded&&!committedPhotos.some(a=>a.kind==='photo'&&a.photoId===p.id))||work.input.draft.customer_id!==null&&!work.attempts.some(a=>a.kind==='copy'&&a.state==='committed')))return false;
  return true;
}
export function createContractWork(scope:ContractWorkScope,idValue:string,input:MobileDraftInput,baseDraftId:number|null,now:number):ContractWork {
  const result:ContractWork={version:1,id:idValue,scope:clone(scope),baseDraftId,contractId:null,input:clone(input),step:0,photos:[],attempts:[],status:'open',createdAt:now,updatedAt:now};
  if(!isContractWork(result))throw new ContractWorkRuleError('Thông tin bản đang soạn chưa hợp lệ. Chưa lưu lên máy chủ.');
  return result;
}
export function remainingWorkPhotos(work:ContractWork){
  try{return orderContractPhotoUploads(work.photos.filter(p=>!p.discarded).map(p=>({...p,...(work.attempts.some(a=>a.kind==='photo'&&a.photoId===p.id&&a.state==='committed'&&a.acknowledged)?{savedTo:work.contractId!}:{})})),work.contractId!,work.input.draft.vehicles.map(v=>v.id));}catch(error){throw new ContractWorkRuleError((error as Error).message);}
}
export function changeContractWork(previous:ContractWork,currentScope:ContractWorkScope,command:ContractWorkCommand,now:number):ContractWork {
  if(!isContractWork(previous)||!isContractWorkScope(currentScope)||!sameWorkActor(previous.scope,currentScope))throw new ContractWorkRuleError('Bản đang soạn không thuộc tài khoản hoặc môi trường này.');
  if(previous.status!=='open')throw new ContractWorkRuleError('Bản đang soạn đã kết thúc. Giữ kết quả trước khi mở bản mới.');
  const settling=['committed','cancelled','acknowledge'].includes(command.type);
  // A saved contract keeps its original scope/ID. Current media review/RLS can
  // authorize finishing its queued images without granting metadata edits.
  const savedMedia=previous.contractId!==null&&(command.type==='plan-photo'||command.type==='plan-copy'||command.type==='finish');
  if(!sameWorkScope(previous.scope,currentScope)&&!settling&&!savedMedia)throw new ContractWorkRuleError('Cơ sở hoặc quyền đã đổi. Giữ bản gốc và đối chiếu trước khi tiếp tục.');
  const work=clone(previous),unsettled=work.attempts.find(a=>a.state==='planned'||!a.acknowledged);
  if(unsettled&&!settling)throw new ContractWorkRuleError('Còn yêu cầu chưa rõ kết quả. Đối chiếu mã gốc trước khi sửa hoặc gửi tiếp.');
  const metadataDone=work.contractId!==null;
  if(command.type==='edit'){
    if(metadataDone)throw new ContractWorkRuleError('Thông tin đã lưu trên hợp đồng gốc. Hoàn tất phần còn lại trước khi sửa tiếp.');
    work.input=clone(command.input);work.step=command.step;
  }else if(command.type==='add-photo'||command.type==='bind-photo'||command.type==='remove-photo'){
    if(work.attempts.some(a=>a.kind==='copy'&&a.state==='committed'))throw new ContractWorkRuleError('Giấy tờ đã được hoàn tất. Mở hồ sơ gốc để sửa ảnh.');
    if(command.type==='add-photo'){if(command.photo.discarded)throw new ContractWorkRuleError('Ảnh mới chưa được bỏ khỏi bản đang soạn.');work.photos.push(clone(command.photo));}
    else{
      const photo=work.photos.find(p=>p.id===command.photoId);if(!photo)throw new ContractWorkRuleError('Không tìm thấy ảnh trong bản đang soạn.');
      if(photo.discarded||work.attempts.some(a=>a.kind==='photo'&&a.photoId===photo.id&&(a.state!=='cancelled'||!a.acknowledged)))throw new ContractWorkRuleError('Ảnh đã có mã gửi. Giữ ảnh và phiếu gốc để đối chiếu.');
      if(command.type==='bind-photo')photo.slot=command.slot;else photo.discarded=true;
    }
  }else if(command.type.startsWith('plan-')){
    const planned=command as Extract<ContractWorkCommand,{key:string}>;
    if(!isWorkUuid(planned.key)||work.attempts.some(a=>a.key===planned.key))throw new ContractWorkRuleError('Mã yêu cầu đã được dùng. Giữ mã gốc để đối chiếu.');
    const base={key:planned.key,state:'planned' as const,acknowledged:false,receipt:null};
    if(command.type==='plan-metadata'){
      if(metadataDone)throw new ContractWorkRuleError('Hợp đồng đã có kết quả lưu; không tạo thêm bản nháp.');
      // Validate every plate binding before metadata can be sent, matching the form guard.
      try{orderContractPhotoUploads(work.photos.filter(p=>!p.discarded),work.baseDraftId??1,work.input.draft.vehicles.map(v=>v.id));}catch(error){throw new ContractWorkRuleError((error as Error).message);}
      work.attempts.push({...base,kind:'metadata',operation:work.baseDraftId===null?'draft.create':`draft.update:${work.baseDraftId}`,input:clone(work.input)});
    }else if(command.type==='plan-photo'){
      if(!metadataDone||remainingWorkPhotos(work)[0]?.id!==command.photoId)throw new ContractWorkRuleError('Hoàn tất ảnh theo thứ tự giấy tờ, biển số, GPLX rồi ảnh giao dịch.');
      if(command.review.target.canWrite===false||command.review.photo&&!command.review.photo.readable)throw new ContractWorkRuleError('Chưa được sửa hoặc chưa xem được ảnh cũ. Tải lại để rà soát.');
      work.attempts.push({...base,kind:'photo',operation:`media.contract:${work.contractId}`,photoId:command.photoId,review:clone(command.review)});
    }else if(command.type==='plan-copy'){
      if(!metadataDone||remainingWorkPhotos(work).length||work.attempts.some(a=>a.kind==='copy'&&a.state==='committed'))throw new ContractWorkRuleError('Hoàn tất ảnh còn lại trên hợp đồng gốc trước khi sao chép giấy tờ.');
      work.attempts.push({...base,kind:'copy',operation:`media.copy:${work.contractId}`,review:clone(command.review)});
    }
  }else if(command.type==='committed'||command.type==='cancelled'||command.type==='acknowledge'){
    const attempt=work.attempts.find(a=>a.key===command.key);if(!attempt)throw new ContractWorkRuleError('Không tìm thấy mã yêu cầu gốc trong bản đang soạn.');
    if(command.type==='acknowledge'){
      if(attempt.state==='planned')throw new ContractWorkRuleError('Chưa có phiếu hoặc kết quả khóa mã từ máy chủ.');
      attempt.acknowledged=true;
    }else if(command.type==='cancelled'){
      if(attempt.state==='committed')throw new ContractWorkRuleError('Yêu cầu đã có phiếu; không được đổi thành chưa lưu.');
      attempt.state='cancelled';
    }else{
      if(attempt.state==='cancelled')throw new ContractWorkRuleError('Mã đã khóa; không được dùng lại để ghi.');
      if(attempt.state==='committed'){
        // Receipt lookups can update current/replayed flags. Keep the first immutable proof.
        const original=attempt.receipt;
        if(!original||command.receipt.id!==original.id||command.receipt.revision!==original.revision)throw new ContractWorkRuleError('Phiếu không khớp kết quả đã lưu.');
        if(attempt.kind==='photo'&&!photoReceiptMatches(attempt,command.receipt as MobileMediaReceipt,work)||attempt.kind==='copy'&&!copyReceiptMatches(attempt,command.receipt as MobileCustomerPhotoCopyReceipt,work))throw new ContractWorkRuleError('Phiếu không khớp mã hoặc ảnh gốc.');
      }else{
        if(attempt.kind==='metadata'){
          if(!receipt(command.receipt)||work.baseDraftId!==null&&command.receipt.id!==work.baseDraftId)throw new ContractWorkRuleError('Phiếu không khớp hợp đồng gốc.');
          work.contractId=command.receipt.id;attempt.receipt=clone(command.receipt);
        }else if(attempt.kind==='photo')attempt.receipt=clone(command.receipt as MobileMediaReceipt);
        else attempt.receipt=clone(command.receipt as MobileCustomerPhotoCopyReceipt);
        attempt.state='committed';
      }
    }
  }else work.status=command.type==='finish'?'finished':'discarded';
  work.updatedAt=Math.max(now,work.updatedAt);
  if(!isContractWork(work))throw new ContractWorkRuleError('Không xác nhận được dữ liệu hoặc phiếu của bản đang soạn. Bản đã lưu trước được giữ.');
  return work;
}
