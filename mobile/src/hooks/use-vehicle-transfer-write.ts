import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {uuid} from 'expo';
import {router,usePreventRemove} from 'expo-router';
import {useQueryClient} from '@tanstack/react-query';
import type {MobileVehicleTransferAction,MobileVehicleTransferRecordInput} from '../../../shared/mobile-vehicle-transfers';
import {pendingWrites} from '@/lib/pending-writes';
import {lookupTransferPending,type TransferPending} from '@/lib/vehicle-transfer-form';
import {useSession} from '@/providers/session';
import {vehicleProfileOperations} from '../../../shared/mobile-vehicles';

export function useVehicleTransferWrite(id:string,dirty:boolean) {
  const {api,session}=useSession(),cache=useQueryClient();
  const scope=useMemo(()=>api&&session?{origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores}:null,[api,session]);
  const [checked,setChecked]=useState(false),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false),[pending,setPending]=useState<TransferPending[]>([]);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[exit,setExit]=useState<(()=>void)|null>(null);
  const alive=useRef(true),running=useRef(false);
  const disablePrevention=usePreventRemove(dirty||busy||pending.length>0,({repeat})=>setExit(()=>repeat));
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{
    let cancelled=false;
    if(scope)void lookupTransferPending(scope,id).then(rows=>{
      if(!cancelled&&alive.current){setPending(rows);setChecked(true);setChecking(false);}
    }).catch(cause=>{if(!cancelled&&alive.current){setError((cause as Error).message);setChecking(false);}});
    return()=>{cancelled=true;};
  },[scope,id]);
  const checkPending=useCallback(async()=>{
    if(!scope||running.current)return;
    running.current=true;setChecking(true);setChecked(false);setError('');
    try{const rows=await lookupTransferPending(scope,id);if(alive.current){setPending(rows);setChecked(true);}}
    catch(cause){if(alive.current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setChecking(false);}
  },[scope,id]);
  function openReceipt(action:MobileVehicleTransferAction){disablePrevention();router.replace({pathname:'/vehicle-transfer/[id]',params:{id,action}});}
  async function submit(input:MobileVehicleTransferRecordInput){
    if(!api||!scope||!checked||pending.length||running.current)return;
    running.current=true;setBusy(true);setError('');setNotice('');
    try{
      const reserved=await pendingWrites.reserveExclusive(scope,'vehicle.'+input.action+':'+id,vehicleProfileOperations(id),()=>uuid.v4().toLowerCase());
      if(!alive.current)return;
      if(!reserved.created){setPending(await lookupTransferPending(scope,id));if(/^vehicle\.(update|status):/.test(reserved.operation))setError('Xe còn yêu cầu sửa hồ sơ hoặc đổi trạng thái chưa rõ kết quả. Vào Tài khoản để đối chiếu trước khi điều chuyển.');return;}
      setPending([{action:input.action,key:reserved.key}]);
      await api.recordVehicleTransfer(id,input,reserved.key);
      if(alive.current)openReceipt(input.action);
    }catch(cause){if(alive.current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  async function resolve(entry:TransferPending):Promise<boolean>{
    if(!api||!scope||running.current)return false;
    running.current=true;setBusy(true);setError('');setNotice('');
    try{
      const operation='vehicle.'+entry.action+':'+id,result=await api.resolveWrite(entry.key,operation);if(!alive.current)return false;
      if(result.status==='committed'){openReceipt(entry.action);return false;}
      await pendingWrites.complete(scope,operation,entry.key);
      const rows=await lookupTransferPending(scope,id);if(!alive.current)return false;
      setPending(rows);setNotice('Máy chủ xác nhận chưa ghi và đã khóa mã cũ. Rà soát lại trước khi gửi.');
      for(const queryKey of [['vehicle-transfer-preparation'],['transfer-destinations'],['record'],['catalogue']])void cache.invalidateQueries({queryKey});
      return true;
    }catch(cause){if(alive.current)setError((cause as Error).message);return false;}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  return{checked,checking,busy,pending,error,notice,exit,checkPending,submit,resolve,openReceipt,dismissExit:()=>setExit(null),
    leave:()=>{if(busy)return;const repeat=exit;disablePrevention();setExit(null);repeat?.();}};
}
