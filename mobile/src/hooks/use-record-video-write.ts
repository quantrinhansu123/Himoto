import { useEffect, useMemo, useRef, useState } from 'react';
import { router, usePreventRemove } from 'expo-router';
import { uuid } from 'expo';
import { useQueryClient } from '@tanstack/react-query';
import { videoOperation, type MobileVideoCloudReceipt } from '../../../shared/mobile-video';
import type {MobileVideoBrowserReceipt} from '../../../shared/mobile-video-upload';
import { mediaMutationOperations } from '../../../shared/mobile-media-delete';
import type { MobileMediaSlotInfo } from '../../../shared/mobile-record-media';
import { useSession } from '@/providers/session';
import { pendingWrites } from '@/lib/pending-writes';
import { uploadSignedRecordVideo, type RecordVideo } from '@/lib/record-video';
import {isDirectVideoCandidate,putDirectRecordVideo} from '@/lib/direct-record-video';
import {ApiError} from '@/lib/api';

export function useRecordVideoWrite(id:number, dirty:boolean) {
  const {api,session}=useSession(), cache=useQueryClient();
  const scope=useMemo(()=>api&&session?{origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores}:null,[api,session]);
  const operation=videoOperation(id),[key,setKey]=useState<string|null>(null),[checked,setChecked]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState(''),[stage,setStage]=useState(''),[notice,setNotice]=useState('');
  const [exit,setExit]=useState<(()=>void)|null>(null),[leaving,setLeaving]=useState(false);
  const alive=useRef(true),running=useRef(false),abort=useRef<AbortController|null>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort();};},[]);
  const disable=usePreventRemove(!leaving&&(dirty||busy||!!key),({repeat})=>setExit(()=>repeat));
  async function check(){if(!scope||running.current)return;running.current=true;setBusy(true);setError('');try{const k=await pendingWrites.lookup(scope,operation);if(alive.current){setKey(k);setChecked(true);}}catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}}
  useEffect(()=>{
    if(!scope)return;let cancelled=false;running.current=true;
    pendingWrites.lookup(scope,operation).then(k=>{if(!cancelled&&alive.current){setKey(k);setChecked(true);}}).catch(cause=>{if(!cancelled&&alive.current)setError((cause as Error).message);}).finally(()=>{if(!cancelled){running.current=false;if(alive.current)setBusy(false);}});
    return()=>{cancelled=true;};
  },[scope,operation]);
  const openReceipt=()=>{setLeaving(true);disable();router.replace({pathname:'/video-receipt/[id]',params:{id:String(id)}});};
  async function submit(info:MobileMediaSlotInfo,video:RecordVideo){
    if(!api||!session||!scope||!checked||key||running.current)return;
    running.current=true;setBusy(true);setError('');setNotice('');const controller=new AbortController();abort.current=controller;
    const timeout=setTimeout(()=>controller.abort(),240000);
    try{
      const reserved=await pendingWrites.reserveExclusive(scope,operation,mediaMutationOperations('contracts',id),()=>uuid.v4().toLowerCase());if(!alive.current)return;
      if(reserved.operation!==operation)throw Error('Còn thao tác tệp trên hồ sơ. Vào Tài khoản để đối chiếu trước khi lưu video.');
      setKey(reserved.key);if(!reserved.created)throw Error('Có mã lưu video cũ. Đối chiếu trước khi gửi lại.');
      setStage('Chuẩn bị tải video…');const config=await api.videoUploadConfig(info,reserved.key,controller.signal);if(!alive.current)return;
      let cloud:MobileVideoCloudReceipt|MobileVideoBrowserReceipt|undefined;
      if(config.direct&&await isDirectVideoCandidate(video)) {
        setStage('Đang kiểm tra tệp video…');const sha256=await video.sha256();if(!alive.current)return;
        const direct=await api.signDirectVideo(info,reserved.key,session.user.id,video.size,sha256,controller.signal);if(!alive.current)return;
        if('receipt'in direct)cloud=direct.receipt;
        else {
          setStage('Đang tải video…');await putDirectRecordVideo(video,direct,session.user.id,reserved.key,sha256,controller.signal);if(!alive.current)return;
          setStage('Đang xác minh video đã tải…');
          try{cloud=(await api.verifyDirectVideo(info,reserved.key,direct.ticket,controller.signal)).receipt;}
          catch(cause){if(!(cause instanceof ApiError&&cause.code==='VIDEO_CONVERSION_REQUIRED'))throw cause;}
        }
      }
      if(!cloud) {
        if(!alive.current)return;setStage('Đang chuẩn hóa video…');const signed=await api.signRecordVideo(info,reserved.key);if(!alive.current)return;
        cloud=await uploadSignedRecordVideo(video,signed,session.user.id,reserved.key,controller.signal);
      }
      if(!alive.current)return;
      setStage('Đang lưu vào hồ sơ…');const receipt=await api.saveRecordVideo(info,cloud,reserved.key);if(!alive.current)return;
      if(receipt.actorId!==session.user.id)throw Error('Phiếu không khớp người lưu. Giữ mã để đối chiếu.');
      void cache.invalidateQueries({queryKey:['record-media']});openReceipt();
    }catch(cause){if(alive.current)setError(controller.signal.aborted?'Tải video chưa được xác nhận. Giữ mã để đối chiếu với máy chủ.':(cause as Error).message);}
    finally{clearTimeout(timeout);running.current=false;if(alive.current){setBusy(false);setStage('');}}
  }
  async function resolve(){
    if(!api||!scope||!key||running.current)return false;
    running.current=true;setBusy(true);setError('');
    try{const result=await api.resolveWrite(key,operation);if(!alive.current)return false;if(result.status==='committed'){openReceipt();return false;}
      await pendingWrites.complete(scope,operation,key);if(!alive.current)return false;setKey(null);setNotice('Máy chủ xác nhận chưa gắn video vào hồ sơ và đã khóa mã cũ. Rà soát tệp rồi chọn lưu lại.');return true;
    }catch(cause){if(alive.current)setError((cause as Error).message);return false;}finally{running.current=false;if(alive.current)setBusy(false);}
  }
  return{key,checked,busy,error,stage,notice,exit,submit,resolve,check,openReceipt,dismissExit:()=>setExit(null),leave:()=>{const repeat=exit;setLeaving(true);disable();setExit(null);repeat?.();}};
}
