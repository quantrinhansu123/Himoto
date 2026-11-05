import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {router,usePreventRemove} from 'expo-router';
import {uuid} from 'expo';
import {useQueryClient} from '@tanstack/react-query';
import {mediaOperation,type MobileMediaEntity,type MobileMediaSlotInfo} from '../../../shared/mobile-record-media';
import {mediaMutationOperations} from '../../../shared/mobile-media-delete';
import {useSession} from '@/providers/session';
import {pendingWrites} from '@/lib/pending-writes';
import type {RecordMediaPhoto} from '@/lib/record-media-photo';

export function useRecordMediaWrite(entity:MobileMediaEntity,id:string,dirty:boolean) {
  const {api,session}=useSession(),cache=useQueryClient();
  const [key,setKey]=useState<string|null>(null),[checked,setChecked]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [exit,setExit]=useState<(()=>void)|null>(null);
  const [leaving,setLeaving]=useState(false);
  const alive=useRef(true),running=useRef(false),token=useRef(session?.token);
  const scope=useMemo(()=>api&&session?{origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores}:null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api,session?.user.id,session?.user.storeId,session?.user.allStores]);
  const operation=mediaOperation(entity,Number(id));
  useEffect(()=>{token.current=session?.token;},[session?.token]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const current=(at:string|undefined)=>alive.current&&token.current===at;
  const disable=usePreventRemove(!leaving&&(dirty||busy||!!key),({repeat})=>setExit(()=>repeat));
  const check=useCallback(async()=>{
    if(!scope||running.current)return;
    running.current=true;const at=token.current;
    try{const previous=await pendingWrites.lookup(scope,operation);if(current(at)){setError('');setKey(previous);setChecked(true);}}
    catch(cause){if(current(at))setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setBusy(false);}
  },[scope,operation]);
  useEffect(()=>{
    if(!scope)return;
    let cancelled=false;const at=token.current;running.current=true;
    pendingWrites.lookup(scope,operation).then(previous=>{
      if(!cancelled&&current(at)){setError('');setKey(previous);setChecked(true);}
    }).catch(cause=>{if(!cancelled&&current(at))setError((cause as Error).message);})
      .finally(()=>{if(!cancelled){running.current=false;if(alive.current)setBusy(false);}});
    return()=>{cancelled=true;};
  },[scope,operation]);
  const openReceipt=()=>{setLeaving(true);disable();router.replace({pathname:'/media-receipt/[entity]/[id]',params:{entity,id}});};
  async function submit(info:MobileMediaSlotInfo,photo:RecordMediaPhoto) {
    if(!api||!scope||!checked||running.current||key)return;
    running.current=true;setBusy(true);setError('');setNotice('');const at=token.current;
    try{
      const before=await pendingWrites.lookup(scope,operation);if(!current(at))return;
      if(before){setKey(before);throw Error('Có yêu cầu ảnh khác trên hồ sơ này. Đối chiếu mã cũ trước khi gửi.');}
      const reserved=await pendingWrites.reserveExclusive(scope,operation,mediaMutationOperations(entity,Number(id)),()=>uuid.v4().toLowerCase());if(!current(at))return;
      if(reserved.operation!==operation)throw Error('Còn thao tác ảnh trên hồ sơ này. Vào Tài khoản để đối chiếu trước khi lưu ảnh.');
      const pending=reserved.key;setKey(pending);
      if(!reserved.created)throw Error('Có yêu cầu lưu ảnh trên hồ sơ này. Đối chiếu mã cũ trước khi gửi.');
      const bytes=await photo.bytes();if(!current(at))return;
      if(bytes.byteLength!==photo.size||bytes.byteLength>2*1024*1024)throw Error('Ảnh chuẩn bị đã thay đổi. Đối chiếu mã rồi chọn lại ảnh.');
      const receipt=await api.uploadRecordMedia(info.target,info.slot,info.photo?.revision??null,bytes,pending);if(!current(at))return;
      if(receipt.actorId!==session!.user.id)throw Error('Phiếu không khớp người lưu. Giữ mã để đối chiếu.');
      void cache.invalidateQueries({queryKey:['record-media']});openReceipt();
    }catch(cause){if(current(at))setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  async function resolve():Promise<boolean> {
    if(!api||!scope||!key||running.current)return false;
    running.current=true;setBusy(true);setError('');const at=token.current,previous=key;
    try{
      const result=await api.resolveWrite(previous,operation);if(!current(at))return false;
      if(result.status==='committed'){openReceipt();return false;}
      await pendingWrites.complete(scope,operation,previous);if(!current(at))return false;
      setKey(null);setNotice('Máy chủ xác nhận chưa lưu và đã khóa mã cũ. Ảnh đang chọn được giữ để rà soát lại.');
      void cache.invalidateQueries({queryKey:['record-media']});return true;
    }catch(cause){if(current(at))setError((cause as Error).message);return false;}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  return{key,checked,busy,error,notice,exit,check:()=>{setBusy(true);void check();},submit,resolve,openReceipt,dismissExit:()=>setExit(null),leave:()=>{const repeat=exit;setLeaving(true);disable();setExit(null);repeat?.();}};
}
