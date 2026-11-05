import {useEffect,useMemo,useRef,useState} from 'react';
import {router,usePreventRemove} from 'expo-router';
import {uuid} from 'expo';
import {useQueryClient} from '@tanstack/react-query';
import type {MobileShiftVideoReview} from '../../../shared/mobile-shift-reports';
import type {MobileVideoCloudReceipt} from '../../../shared/mobile-video';
import type {MobileVideoBrowserReceipt} from '../../../shared/mobile-video-upload';
import {useSession} from '@/providers/session';
import {pendingWrites} from '@/lib/pending-writes';
import {uploadSignedRecordVideo,type RecordVideo} from '@/lib/record-video';
import {isDirectVideoCandidate,putDirectRecordVideo} from '@/lib/direct-record-video';
import {ApiError} from '@/lib/api';

export function useShiftVideoWrite(id:string,dirty:boolean) {
  const{api,session}=useSession(),cache=useQueryClient(),operation=`shift.media:${id}`;
  const scope=useMemo(()=>api&&session?{origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores}:null,[api,session]);
  const[key,setKey]=useState<string|null>(null),[checked,setChecked]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState(''),[stage,setStage]=useState(''),[notice,setNotice]=useState(''),[leaving,setLeaving]=useState(false),[exit,setExit]=useState<(()=>void)|null>(null);
  const alive=useRef(true),running=useRef(false),abort=useRef<AbortController|null>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort();};},[]);
  const disable=usePreventRemove(!leaving&&(busy||dirty||!!key),({repeat})=>setExit(()=>repeat));
  useEffect(()=>{if(!scope)return;let cancelled=false;running.current=true;pendingWrites.lookup(scope,operation).then(value=>{if(!cancelled&&alive.current){setKey(value);setChecked(true);}}).catch(cause=>{if(!cancelled&&alive.current)setError((cause as Error).message);}).finally(()=>{if(!cancelled){running.current=false;if(alive.current)setBusy(false);}});return()=>{cancelled=true;};},[scope,operation]);
  function openResult(value:string){setLeaving(true);disable();router.replace({pathname:'/shift-result/[key]',params:{key:value}});}
  async function check(){if(!scope||running.current)return;running.current=true;setBusy(true);setError('');try{const value=await pendingWrites.lookup(scope,operation);if(alive.current){setKey(value);setChecked(true);}}catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}}
  async function submit(review:MobileShiftVideoReview,video:RecordVideo) {
    if(!api||!session||!scope||!checked||key||running.current)return;running.current=true;setBusy(true);setError('');setNotice('');const controller=new AbortController();abort.current=controller;const timer=setTimeout(()=>controller.abort(),240000);
    try{
      const intent=await pendingWrites.reserveExclusive(scope,operation,[operation,`shift.update:${id}`,`shift.audit:${id}`],()=>uuid.v4().toLowerCase());if(!alive.current)return;
      if(intent.operation!==operation)throw Error('Còn thao tác báo cáo ca chưa đối chiếu. Mở Tài khoản để kiểm tra mã gốc.');setKey(intent.key);if(!intent.created)throw Error('Giữ mã lưu minh chứng cũ để đối chiếu trước khi gửi video.');
      setStage('Đang kiểm tra báo cáo và video…');const config=await api.shiftVideoConfig(id,review,intent.key,controller.signal);if(!alive.current)return;
      let cloud:MobileVideoCloudReceipt|MobileVideoBrowserReceipt|undefined;
      if(config.direct&&await isDirectVideoCandidate(video)) {
        const hash=await video.sha256();if(!alive.current)return;const signed=await api.signShiftDirectVideo(id,review,intent.key,session.user.id,video.size,hash,controller.signal);if(!alive.current)return;
        if('receipt'in signed)cloud=signed.receipt;else{setStage('Đang tải video…');await putDirectRecordVideo(video,signed,session.user.id,intent.key,hash,controller.signal);if(!alive.current)return;setStage('Đang xác minh video…');try{cloud=(await api.verifyShiftDirectVideo(id,review,intent.key,signed.ticket,controller.signal)).receipt;}catch(cause){if(!(cause instanceof ApiError&&cause.code==='VIDEO_CONVERSION_REQUIRED'))throw cause;}}
      }
      if(!cloud){if(!alive.current)return;setStage('Đang chuẩn hóa video…');const signed=await api.signShiftVideo(id,review,intent.key,controller.signal);cloud=await uploadSignedRecordVideo(video,signed,session.user.id,intent.key,controller.signal);}
      if(!alive.current)return;setStage('Đang lưu video vào báo cáo…');const mediaId=uuid.v4().toLowerCase(),saved=await api.saveShiftVideo(id,mediaId,review,cloud,intent.key);if(!alive.current)return;
      const proof=await api.shiftResult(intent.key);if(!alive.current)return;
      if(proof.operation!==operation||String(proof.receipt.id)!==id||String(proof.receipt.revision)!==String(saved.revision)||!proof.current.media?.some(m=>m.id===mediaId&&m.stage===review.stage&&m.category===review.category&&m.mime_type==='video/mp4'))throw Error('Chưa đối chiếu được đúng video đã lưu. Giữ mã để đọc phiếu gốc.');
      void cache.invalidateQueries({queryKey:['shift']});openResult(intent.key);
    }catch(cause){if(alive.current)setError(controller.signal.aborted?'Tải video chưa được xác nhận. Giữ mã để đối chiếu.':(cause as Error).message);}finally{clearTimeout(timer);running.current=false;if(alive.current){setBusy(false);setStage('');}}
  }
  async function resolve(){if(!api||!scope||!key||running.current)return false;running.current=true;setBusy(true);setError('');try{const result=await api.resolveWrite(key,operation);if(!alive.current)return false;if(result.status==='committed'){openResult(key);return false;}await pendingWrites.complete(scope,operation,key);if(!alive.current)return false;setKey(null);setNotice('Máy chủ xác nhận chưa lưu video và đã khóa mã cũ. Rà soát lại báo cáo trước khi gửi.');return true;}catch(cause){if(alive.current)setError((cause as Error).message);return false;}finally{running.current=false;if(alive.current)setBusy(false);}}
  return{key,checked,busy,error,stage,notice,exit,submit,resolve,check,openResult:()=>{if(key)openResult(key);},dismissExit:()=>setExit(null),leave:()=>{const repeat=exit;setLeaving(true);disable();setExit(null);repeat?.();}};
}
