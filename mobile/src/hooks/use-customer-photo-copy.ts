import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {uuid} from 'expo';
import {useQueryClient} from '@tanstack/react-query';
import {customerPhotoCopyOperation,type MobileCustomerPhotoCopyReview,type MobileCustomerPhotoCopyReceipt} from '../../../shared/mobile-customer-photo-copy';
import type {DraftWorkController} from '@/lib/draft-work-controller';
import {useSession} from '@/providers/session';
import {pendingWrites} from '@/lib/pending-writes';
import {mediaMutationOperations} from '../../../shared/mobile-media-delete';

export function useCustomerPhotoCopy(id:number,{expectedRevision,onComplete,autoFinish=false,work=null}:{work?:DraftWorkController|null;expectedRevision?:string;onComplete:()=>Promise<void>;autoFinish?:boolean}){
  const {api,session}=useSession(),cache=useQueryClient();
  const scope=useMemo(()=>api&&session?{origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores}:null,[api,session]);
  const operation=customerPhotoCopyOperation(id),alive=useRef(true),running=useRef(false),token=useRef(session?.token),complete=useRef(onComplete);
  const [checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[key,setKey]=useState<string|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [review,setReview]=useState<MobileCustomerPhotoCopyReview|null>(null),[receipt,setReceipt]=useState<MobileCustomerPhotoCopyReceipt|null>(null);
  useEffect(()=>{token.current=session?.token;complete.current=onComplete;},[session?.token,onComplete]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const current=useCallback((at:string|undefined)=>alive.current&&token.current===at,[]);
  const verify=useCallback((proof:MobileCustomerPhotoCopyReceipt)=>{
    if(proof.id!==id||proof.actorId!==scope?.userId)throw Error('Phiếu lấy giấy tờ không khớp hợp đồng hoặc người lưu. Giữ mã để đối chiếu.');
  },[id,scope?.userId]);
  const load=useCallback(async()=>{
    if(!api||!scope||running.current)return;running.current=true;setBusy(true);setError('');const at=token.current;
    try{
      const pending=work?.pending('copy')??await pendingWrites.lookup(scope,operation);if(pending&&work&&!work.owns(pending))throw Error('Còn yêu cầu của thao tác khác trên hợp đồng. Vào Tài khoản để đối chiếu.');if(!current(at))return;setKey(pending);
      if(pending){const found=await api.customerPhotoCopyReceipt(id,pending);if(!current(at))return;if(found.receipt)verify(found.receipt);setReceipt(found.receipt);}
      else{const found=await api.customerPhotoCopyReview(id);if(!current(at))return;setReview(found);}
      setChecked(true);
    }catch(cause){if(current(at))setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setBusy(false);}
  },[api,scope,operation,current,id,verify,work]);
  useEffect(()=>{void Promise.resolve().then(()=>{if(alive.current)void load();});},[load]);
  async function finish(proof:MobileCustomerPhotoCopyReceipt,pending:string|null){
    if(!scope)throw Error('Chưa có phiên để đối chiếu giấy tờ.');verify(proof);const at=token.current;
    if(pending){if(proof.requestId!==pending)throw Error('Phiếu lấy giấy tờ không khớp mã yêu cầu.');if(work)await work.settleCopy(pending,proof);else await pendingWrites.complete(scope,operation,pending);if(!current(at))return;setKey(null);}
    void cache.invalidateQueries({queryKey:['record-media']});await complete.current();
  }
  async function save(){
    if(!api||!scope||running.current||!checked||key||receipt)return;running.current=true;setBusy(true);setError('');setNotice('Đang lấy giấy tờ vào đúng hợp đồng đã lưu.');const at=token.current;
    try{
      const prepared=review??await api.customerPhotoCopyReview(id);if(!current(at))return;setReview(prepared);
      if(expectedRevision&&prepared.revision!==expectedRevision)throw Error('Hợp đồng đã đổi sau lần lưu. Giữ bản nháp đã có; mở lại hồ sơ để kiểm tra trước khi lấy giấy tờ.');
      const reserved=work?await work.reserveCopy(prepared):await pendingWrites.reserveExclusive(scope,operation,mediaMutationOperations('contracts',id),()=>uuid.v4().toLowerCase());if(!current(at))return;
      if(reserved.operation!==operation)throw Error('Còn thao tác ảnh trên hợp đồng này. Vào Tài khoản để đối chiếu trước khi lấy giấy tờ.');
      setKey(reserved.key);
      if(!reserved.created)throw Error('Còn yêu cầu giấy tờ chưa đối chiếu trên hợp đồng này. Giữ mã để kiểm tra.');
      const proof=await api.copyCustomerPhotos(prepared,reserved.key);if(!current(at))return;verify(proof);setReceipt(proof);setNotice(`Đã bổ sung ${proof.copied} ảnh giấy tờ; các ảnh hợp đồng đã có được giữ.`);
      if(autoFinish)await finish(proof,reserved.key);
    }catch(cause){if(current(at)){setError((cause as Error).message);setNotice('Chưa xác nhận kết quả lấy giấy tờ. Hợp đồng đã lưu được giữ; đối chiếu hoặc tải lại trước khi tiếp tục.');}}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  async function resolve(){
    if(!api||!scope||!key||running.current)return;running.current=true;setBusy(true);setError('');const at=token.current,pending=key;
    try{
      const result=await api.resolveWrite(pending,operation);if(!current(at))return;
      if(result.status==='committed'){
        const found=await api.customerPhotoCopyReceipt(id,pending);if(!current(at))return;
        if(!found.receipt)throw Error('Đã lấy giấy tờ nhưng chưa đọc được phiếu. Giữ mã và tải lại.');verify(found.receipt);setReceipt(found.receipt);setNotice('Đã tìm thấy kết quả gốc. Kiểm tra phiếu trước khi tiếp tục.');
      }else{if(work)await work.cancel(pending);else await pendingWrites.complete(scope,operation,pending);if(!current(at))return;setKey(null);setReceipt(null);setReview(null);setNotice('Chưa lấy giấy tờ; mã cũ đã khóa. Hợp đồng và ảnh đã lưu được giữ để tiếp tục.');}
    }catch(cause){if(current(at))setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  async function acknowledge(){
    if(!receipt||running.current)return;running.current=true;setBusy(true);setError('');const at=token.current;
    try{await finish(receipt,key);}catch(cause){if(current(at))setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}
  }
  return{review,receipt,key,checked,busy,error,notice,load,save,resolve,acknowledge};
}
