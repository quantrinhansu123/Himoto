import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {uuid} from 'expo';
import {router,usePreventRemove} from 'expo-router';
import {useQueryClient} from '@tanstack/react-query';
import type {MobileVehicleStatusInput} from '../../../shared/mobile-vehicle-status';
import {vehicleProfileOperations} from '../../../shared/mobile-vehicles';
import {pendingWrites} from '@/lib/pending-writes';
import {useSession} from '@/providers/session';

export function useVehicleStatusWrite(id:string,dirty:boolean) {
  const {api,session}=useSession(),cache=useQueryClient();
  const scope=useMemo(()=>api&&session?{origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores}:null,[api,session]);
  const [checked,setChecked]=useState(false),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false);
  const [pending,setPending]=useState<{operation:string;key:string}[]>([]),[error,setError]=useState(''),[exit,setExit]=useState<(()=>void)|null>(null);
  const alive=useRef(true),running=useRef(false),operation=`vehicle.status:${id}`;
  const disablePrevention=usePreventRemove(dirty||busy||pending.length>0,({repeat})=>setExit(()=>repeat));
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const check=useCallback(async()=>{
    if(!scope||running.current)return;
    running.current=true;setChecking(true);setChecked(false);setError('');
    try{
      const rows=(await pendingWrites.list(scope,true)).filter(r=>vehicleProfileOperations(id).includes(r.operation)||r.operation==='bulk.vehicles.delete');
      if(alive.current){setPending(rows);setChecked(true);}
    }catch(cause){if(alive.current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setChecking(false);}
  },[scope,id]);
  useEffect(()=>{
    if(!scope)return;
    let cancelled=false;
    void pendingWrites.list(scope,true).then(rows=>{if(!cancelled&&alive.current){setPending(rows.filter(r=>vehicleProfileOperations(id).includes(r.operation)||r.operation==='bulk.vehicles.delete'));setChecked(true);setChecking(false);}})
      .catch(cause=>{if(!cancelled&&alive.current){setError((cause as Error).message);setChecking(false);}});
    return()=>{cancelled=true;};
  },[scope,id]);
  function open(key:string){disablePrevention();router.replace({pathname:'/vehicle-status-result/[key]',params:{key}});}
  function account(){disablePrevention();router.replace('/(tabs)/account');}
  async function submit(input:MobileVehicleStatusInput&{review_snapshot:string}) {
    if(!api||!scope||!checked||pending.length||running.current)return;
    running.current=true;setBusy(true);setError('');
    try{
      const saved=await pendingWrites.reserveExclusive(scope,operation,vehicleProfileOperations(id),()=>uuid.v4().toLowerCase());
      if(!alive.current)return;
      setPending([{operation:saved.operation,key:saved.key}]);
      if(!saved.created)return;
      await api.recordVehicleStatus(id,input,saved.key);
      if(alive.current){for(const queryKey of [['record'],['catalogue'],['vehicle-profile'],['vehicle-history'],['vehicle-status-preparation'],['fleet-inventory']])void cache.invalidateQueries({queryKey});open(saved.key);}
    }catch(cause){if(alive.current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  return{checked,checking,busy,pending,error,exit,check,submit,open,account,dismissExit:()=>setExit(null),
    leave:()=>{if(busy)return;const repeat=exit;disablePrevention();setExit(null);repeat?.();}};
}
