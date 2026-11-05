import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {uuid} from 'expo';
import {router,usePreventRemove} from 'expo-router';
import {useQueryClient} from '@tanstack/react-query';
import type {MobileSwapInput} from '../../../shared/mobile-swaps';
import {pendingWrites} from '@/lib/pending-writes';
import {contractReturnOperations,lookupContractReturnPending} from '@/lib/contract-return-pending';
import {useSession} from '@/providers/session';

export function useSwapWrite(id:string,dirty:boolean) {
  const {api,session}=useSession(),cache=useQueryClient(),operation='return.swap:'+id;
  const scope=useMemo(()=>api&&session?{origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores}:null,[api,session]);
  const [checked,setChecked]=useState(false),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false),[key,setKey]=useState<string|null>(null);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[exit,setExit]=useState<(()=>void)|null>(null);
  const alive=useRef(true),running=useRef(false);
  const disablePrevention=usePreventRemove(dirty||busy||!!key,({repeat})=>setExit(()=>repeat));
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const checkPending=useCallback(async()=>{
    if(!api||!scope||running.current)return;
    running.current=true;setChecking(true);setChecked(false);setError('');
    try{
      const previous=await lookupContractReturnPending(scope,operation);
      if(alive.current){setKey(previous);setChecked(true);}
    }catch(cause){if(alive.current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setChecking(false);}
  },[api,scope,operation]);
  useEffect(()=>{
    let cancelled=false;
    if(api&&scope)void lookupContractReturnPending(scope,operation).then(previous=>{
      if(!cancelled&&alive.current){setKey(previous);setChecked(true);setChecking(false);}
    }).catch(cause=>{if(!cancelled&&alive.current){setError((cause as Error).message);setChecking(false);}});
    return()=>{cancelled=true;};
  },[api,scope,operation]);
  function openReceipt(){disablePrevention();router.replace({pathname:'/swap/[id]',params:{id}});}
  async function submit(input:MobileSwapInput){
    if(!api||!scope||!checked||key||running.current)return;
    running.current=true;setBusy(true);setError('');setNotice('');
    try{
      const pending=await pendingWrites.reserveExclusive(scope,operation,contractReturnOperations(id),()=>uuid.v4().toLowerCase());
      if(!alive.current)return;
      if(pending.operation!==operation){setChecked(false);throw Error('Còn thao tác trả, đổi hoặc thu hồi xe chưa rõ kết quả. Vào Tài khoản để đối chiếu.');}
      setKey(pending.key);if(!pending.created)return;
      await api.recordSwap(id,input,pending.key);
      if(alive.current)openReceipt();
    }catch(cause){if(alive.current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  async function resolve():Promise<boolean>{
    if(!api||!scope||!key||running.current)return false;
    running.current=true;setBusy(true);setError('');setNotice('');
    try{
      const result=await api.resolveWrite(key,operation);if(!alive.current)return false;
      if(result.status==='committed'){openReceipt();return false;}
      await pendingWrites.complete(scope,operation,key);if(!alive.current)return false;
      setKey(null);setNotice('Máy chủ xác nhận chưa ghi đổi xe và đã khóa mã cũ. Rà soát xe đang chọn trước khi gửi lại.');
      for(const queryKey of [['swap-preparation'],['swap-candidates'],['record'],['catalogue']])void cache.invalidateQueries({queryKey});
      return true;
    }catch(cause){if(alive.current)setError((cause as Error).message);return false;}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  return{checked,checking,busy,key,error,notice,exit,checkPending,submit,resolve,openReceipt,openAccount:()=>router.push('/(tabs)/account'),dismissExit:()=>setExit(null),
    leave:()=>{if(busy)return;const repeat=exit;disablePrevention();setExit(null);repeat?.();}};
}
