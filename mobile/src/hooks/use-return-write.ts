import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {uuid} from 'expo';
import {router,usePreventRemove} from 'expo-router';
import {useQueryClient} from '@tanstack/react-query';
import type {MobileReturnRecordInput} from '../../../shared/mobile-return-write';
import {pendingWrites} from '@/lib/pending-writes';
import {contractReturnOperations,lookupContractReturnPending} from '@/lib/contract-return-pending';
import {useSession} from '@/providers/session';

export function useReturnWrite(id:string,dirty:boolean) {
  const {api,session}=useSession(),cache=useQueryClient(),operation='return.record:'+id;
  const scope=useMemo(()=>api&&session?{origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores}:null,[api,session]);
  const [checked,setChecked]=useState(false),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false),[key,setKey]=useState<string|null>(null);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[exit,setExit]=useState<(()=>void)|null>(null);
  const alive=useRef(true),running=useRef(false);
  const disablePrevention=usePreventRemove(dirty||busy||!!key,({repeat})=>setExit(()=>repeat));
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{
    let cancelled=false;
    if(api&&scope)void lookupContractReturnPending(scope,operation).then(previous=>{
      if(!cancelled&&alive.current){setKey(previous);setChecked(true);setChecking(false);}
    }).catch(cause=>{if(!cancelled&&alive.current){setError((cause as Error).message);setChecking(false);}});
    return()=>{cancelled=true;};
  },[api,scope,operation]);
  const checkPending=useCallback(async()=>{
    if(!api||!scope||running.current)return;
    running.current=true;setChecking(true);setChecked(false);setError('');
    try{const previous=await lookupContractReturnPending(scope,operation);if(alive.current){setKey(previous);setChecked(true);}}
    catch(cause){if(alive.current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setChecking(false);}
  },[api,scope,operation]);
  function openReceipt(){
    disablePrevention();router.replace({pathname:'/return/[id]',params:{id}});
  }
  async function submit(input:MobileReturnRecordInput){
    if(!api||!scope||!checked||key||running.current)return;
    running.current=true;setBusy(true);setError('');setNotice('');
    try{
      const pending=await pendingWrites.reserveExclusive(scope,operation,contractReturnOperations(id),()=>uuid.v4().toLowerCase());
      if(!alive.current)return;
      if(pending.operation!==operation){setChecked(false);throw Error('Còn thao tác trả, đổi hoặc thu hồi xe chưa rõ kết quả. Vào Tài khoản để đối chiếu.');}
      setKey(pending.key);if(!pending.created)return;
      await api.recordReturn(id,input,pending.key);
      if(alive.current)openReceipt();
    }catch(cause){if(alive.current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  async function resolve(){
    if(!api||!scope||!key||running.current)return;
    running.current=true;setBusy(true);setError('');setNotice('');
    try{
      const result=await api.resolveWrite(key,operation);if(!alive.current)return;
      if(result.status==='committed'){openReceipt();return;}
      await pendingWrites.complete(scope,operation,key);if(!alive.current)return;
      setKey(null);setNotice('Máy chủ xác nhận chưa ghi và đã khóa mã cũ. Nội dung được giữ; rà soát phí và tiền lại trước khi gửi.');
      for(const queryKey of [['return-preparation'],['record'],['finance']])void cache.invalidateQueries({queryKey});
    }catch(cause){if(alive.current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  return{checked,checking,busy,key,error,notice,exit,checkPending,submit,resolve,openReceipt,openAccount:()=>router.push('/(tabs)/account'),dismissExit:()=>setExit(null),
    leave:()=>{if(busy)return;const repeat=exit;disablePrevention();setExit(null);repeat?.();}};
}
