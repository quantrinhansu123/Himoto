import {useEffect,useMemo,useRef,useState} from 'react';
import {router,usePreventRemove} from 'expo-router';
import {uuid} from 'expo';
import {useQueryClient} from '@tanstack/react-query';
import type {MobileTelegramResult} from '../../../shared/mobile-telegram';
import {useSession} from '@/providers/session';
import {pendingWrites} from '@/lib/pending-writes';
export function useTelegramWrite(operation:string,dirty=false){
  const {api,session}=useSession(),cache=useQueryClient(),scope=useMemo(()=>api&&session?{origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores}:null,[api,session]);
  const [key,setKey]=useState<string|null>(null),[checked,setChecked]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[leaving,setLeaving]=useState(false),[exit,setExit]=useState<(()=>void)|null>(null);
  const alive=useRef(true),running=useRef(false);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const disable=usePreventRemove(!leaving&&(busy||!!key||dirty),({repeat})=>setExit(()=>repeat));
  useEffect(()=>{if(!scope)return;let cancelled=false;running.current=true;pendingWrites.lookup(scope,operation).then(value=>{if(!cancelled&&alive.current){setKey(value);setChecked(true);}}).catch(cause=>{if(!cancelled&&alive.current)setError((cause as Error).message);}).finally(()=>{if(!cancelled){running.current=false;if(alive.current)setBusy(false);}});return()=>{cancelled=true;};},[scope,operation]);
  function openResult(requestKey:string){setLeaving(true);disable();router.replace({pathname:'/telegram-result/[key]',params:{key:requestKey}});}
  async function check(){if(!scope||running.current)return;running.current=true;setBusy(true);setError('');try{const found=await pendingWrites.lookup(scope,operation);if(alive.current){setKey(found);setChecked(true);}}catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}}
  async function submit(send:(key:string)=>Promise<MobileTelegramResult>){
    if(!scope||!api||running.current||!checked||key)return;running.current=true;setBusy(true);setError('');setNotice('');
    try{const intent=await pendingWrites.reserveExclusive(scope,operation,[operation],()=>uuid.v4().toLowerCase());if(!alive.current)return;setKey(intent.key);if(!intent.created)throw Error('Giữ mã Telegram cũ và đối chiếu trước khi gửi thêm.');const result=await send(intent.key);if(!alive.current)return;if(result.key!==intent.key||result.operation!==operation)throw Error('Xác nhận Telegram chưa khớp lần gửi. Giữ mã để đối chiếu.');void cache.invalidateQueries({queryKey:['telegram']});openResult(intent.key);}
    catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}
  }
  async function resolve(){if(!api||!scope||!key||running.current)return false;running.current=true;setBusy(true);setError('');try{const value=await api.resolveWrite(key,operation);if(!alive.current)return false;if(value.status==='committed'){openResult(key);return false;}await pendingWrites.complete(scope,operation,key);if(!alive.current)return false;setKey(null);setNotice('Máy chủ xác nhận chưa ghi yêu cầu này và đã khóa mã cũ. Tải lại trạng thái trước khi thao tác tiếp.');return true;}catch(cause){if(alive.current)setError((cause as Error).message);return false;}finally{running.current=false;if(alive.current)setBusy(false);}}
  return{key,checked,busy,error,notice,exit,submit,resolve,check,openResult:()=>{if(key)openResult(key);},dismissExit:()=>setExit(null),leave:()=>{const repeat=exit;setLeaving(true);disable();setExit(null);repeat?.();}};
}
