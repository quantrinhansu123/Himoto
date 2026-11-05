import type {MobileDraftInput,MobileWriteReceipt} from '../../../shared/mobile-contract';
import type {ContractWorkScope,ContractWorkCommand,ContractWorkAttempt} from '../../../shared/mobile-contract-work';
import {sameWorkScope,ContractWorkRuleError} from '../../../shared/mobile-contract-work';
import type {MobileMediaReceipt,MobileMediaSlotInfo} from '../../../shared/mobile-record-media';
import type {MobileCustomerPhotoCopyReceipt,MobileCustomerPhotoCopyReview} from '../../../shared/mobile-customer-photo-copy';
import type {ContractWorkHead} from './contract-work-journal';
import type {openNativeContractWorkStore} from './contract-work-files';
import type {RecordMediaPhoto} from './record-media-photo';
import {reserveContractWorkIntent,settleContractWorkIntent} from './contract-work-intent';

type Store=Awaited<ReturnType<typeof openNativeContractWorkStore>>;
export interface WorkLedger {
  reserveExclusive(scope:ContractWorkScope,operation:string,conflicts:readonly string[],makeKey:()=>string):Promise<{operation:string;key:string;created:boolean}>;
  complete(scope:ContractWorkScope,operation:string,key:string):Promise<void>;
}
export type WorkLocalPhoto={id:string;slot:string;photo:RecordMediaPhoto;savedTo?:number;durable?:boolean};
/** One ordered owner of a work head. React views never own durable files or request associations. */
export function createDraftWorkController({store,scope,workId,baseDraftId,initialHead=null,ledger,makeUuid}:{store:Store;scope:ContractWorkScope;workId:string;baseDraftId:number|null;initialHead?:ContractWorkHead|null;ledger:WorkLedger;makeUuid:()=>string}){
  scope={...scope};let head=initialHead,queue:Promise<unknown>=Promise.resolve(),reader:(()=>{input:MobileDraftInput;step:number})|null=null;
  let timer:ReturnType<typeof setTimeout>|undefined,lastError='',pendingSave=false,initialInputJson:string|undefined;
  const listeners=new Set<()=>void>();
  const publish=()=>listeners.forEach(fn=>fn());
  const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
  function serial<T>(task:()=>Promise<T>):Promise<T>{
    const result=queue.then(task).catch(async error=>{if(head){try{head=await store.load(workId);}catch{/* Preserve the last known head; never infer an empty work. */}}lastError=(error as Error).message;publish();throw error;});queue=result.catch(()=>{});return result;
  }
  async function update(command:ContractWorkCommand){if(!head)throw new ContractWorkRuleError('Chưa lưu được bản đang soạn.');head=await store.change(head,scope,command);publish();return head;}
  async function flushNow(value?:{input:MobileDraftInput;step:number}){
    if(timer){clearTimeout(timer);timer=undefined;}
    const current=value??reader?.();if(!current)throw new ContractWorkRuleError('Chưa đọc được thông tin đang nhập.');
    if(!head)head=await store.create(workId,current.input,baseDraftId);
    if(JSON.stringify(head.work.input)!==JSON.stringify(current.input)||head.work.contractId===null&&!head.work.attempts.some(a=>a.state==='planned'||!a.acknowledged)&&head.work.step!==current.step)await update({type:'edit',input:current.input,step:current.step});
    pendingSave=false;lastError='';publish();return head;
  }
  async function settle(key:string,outcome:Extract<ContractWorkCommand,{type:'committed'|'cancelled'}>){
    if(!head||!head.work.attempts.some(a=>a.key===key))throw new ContractWorkRuleError('Mã yêu cầu không thuộc bản đang soạn này. Giữ mã gốc để đối chiếu.');
    head=await settleContractWorkIntent(store,workId,scope,outcome,ledger);lastError='';publish();return head;
  }
  async function reserve(command:Extract<ContractWorkCommand,{type:'plan-metadata'|'plan-photo'|'plan-copy'}>){
    if(!head)throw new ContractWorkRuleError('Chưa có bản đang soạn trên thiết bị.');
    const old=head.work.attempts.find(a=>a.state==='planned'||!a.acknowledged);
    if(old){if(old.kind!==command.type.slice(5)||old.kind==='photo'&&command.type==='plan-photo'&&old.photoId!==command.photoId)throw new ContractWorkRuleError('Còn thao tác khác chưa rõ kết quả trên bản này. Đối chiếu trước khi tiếp tục.');}
    else await update(command);
    const reserved=await reserveContractWorkIntent(store,workId,scope,ledger);head=reserved.head;publish();return{key:reserved.attempt.key,created:reserved.sendAllowed,operation:reserved.attempt.operation};
  }
  return {
    id:workId,scope,initialInput:initialHead?.work.input,initialStep:initialHead?.work.step??0,
    getHead:()=>head,
    getState:()=>({saving:pendingSave,error:lastError,scopeChanged:!!head&&!sameWorkScope(head.work.scope,scope),waiting:!!head?.work.attempts.some(a=>a.state==='planned'||!a.acknowledged)}),
    subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
    setReader(next:typeof reader){reader=next;if(initialInputJson===undefined&&next)initialInputJson=JSON.stringify(next().input);},
    hasLocalChanges(){if(head)return head.work.status==='open';return pendingSave||!!reader&&initialInputJson!==JSON.stringify(reader().input);},
    schedule(){pendingSave=true;publish();if(timer)clearTimeout(timer);timer=setTimeout(()=>{timer=undefined;void serial(()=>flushNow()).catch(()=>{});},450);},
    flush(input?:MobileDraftInput,step?:number){const value=input?{input:clone(input),step:step??0}:undefined;return serial(()=>flushNow(value));},
    pending(kind:ContractWorkAttempt['kind']){return head?.work.attempts.find(a=>a.kind===kind&&(a.state==='planned'||!a.acknowledged))?.key??null;},
    owns(key:string){return !!head?.work.attempts.some(a=>a.key===key);},
    metadataReceipt(){const row=head?.work.attempts.find(a=>a.kind==='metadata'&&a.state==='committed');return row?.kind==='metadata'?row.receipt:null;},
    async restorePhotos():Promise<WorkLocalPhoto[]>{
      if(!head)return[];const result:WorkLocalPhoto[]=[];
      for(const photo of head.work.photos.filter(p=>!p.discarded)){
        const saved=head.work.attempts.some(a=>a.kind==='photo'&&a.photoId===photo.id&&a.state==='committed'&&a.acknowledged);
        result.push({id:photo.id,slot:photo.slot,photo:await store.readPhoto(workId,photo.id),durable:true,...(saved?{savedTo:head.work.contractId!}:{})});
      }
      return result;
    },
    importPhoto(row:WorkLocalPhoto):Promise<WorkLocalPhoto>{return serial(async()=>{await flushNow();const existing=head?.work.photos.find(p=>p.id===row.id);if(existing)await store.recoverPreparedPhoto(workId,row.id,row.slot,row.photo);else{const photo=await store.importPreparedPhoto(workId,row.id,row.slot,row.photo);await update({type:'add-photo',photo});}const durable=await store.readPhoto(workId,row.id);row.photo.dispose();return{...row,photo:durable,durable:true};});},
    bindPhoto(photoId:string,slot:string){return serial(async()=>{await flushNow();await update({type:'bind-photo',photoId,slot});});},
    removePhoto(photoId:string){return serial(async()=>{if(!head)return;await update({type:'remove-photo',photoId});});},
    discardUnsentPhotos(){return serial(async()=>{if(!head)return;for(const photo of head.work.photos.filter(p=>!p.discarded&&!head!.work.attempts.some(a=>a.kind==='photo'&&a.photoId===p.id&&a.state==='committed')))await update({type:'remove-photo',photoId:photo.id});});},
    reserveMetadata(input:MobileDraftInput){return serial(async()=>{await flushNow({input:clone(input),step:reader?.().step??0});return reserve({type:'plan-metadata',key:makeUuid()});});},
    reservePhoto(photoId:string,review:MobileMediaSlotInfo){return serial(async()=>reserve({type:'plan-photo',key:makeUuid(),photoId,review:clone(review)}));},
    reserveCopy(review:MobileCustomerPhotoCopyReview){return serial(async()=>reserve({type:'plan-copy',key:makeUuid(),review:clone(review)}));},
    observeMetadata(key:string,receipt:MobileWriteReceipt){return serial(async()=>{if(!head?.work.attempts.some(a=>a.key===key&&a.kind==='metadata'))throw new ContractWorkRuleError('Phiếu không thuộc bản đang soạn này.');await update({type:'committed',key,receipt});});},
    settleMetadata(key:string,receipt:MobileWriteReceipt){return serial(()=>settle(key,{type:'committed',key,receipt}));},
    settlePhoto(key:string,receipt:MobileMediaReceipt){return serial(async()=>{const attempt=head?.work.attempts.find(a=>a.key===key);if(attempt?.kind!=='photo')throw new ContractWorkRuleError('Phiếu không khớp ảnh đang soạn.');await settle(key,{type:'committed',key,receipt});return attempt.photoId;});},
    settleCopy(key:string,receipt:MobileCustomerPhotoCopyReceipt){return serial(()=>settle(key,{type:'committed',key,receipt}));},
    cancel(key:string){return serial(()=>settle(key,{type:'cancelled',key}));},
    finish(){return serial(async()=>{if(!head)return;await update({type:'finish'});});},
    discard(){return serial(async()=>{if(!head)return;await update({type:'discard'});});},
    async detach(){if(timer){clearTimeout(timer);timer=undefined;}if(pendingSave)await serial(()=>flushNow());else await queue;reader=null;},
  };
}
export type DraftWorkController=ReturnType<typeof createDraftWorkController>;
