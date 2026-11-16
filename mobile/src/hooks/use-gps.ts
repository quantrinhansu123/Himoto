import {useCallback,useMemo} from 'react';
import {AppState} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useSession} from '@/providers/session';
import {GPS_POLL_INTERVAL_MS,gpsQueryString,type MobileGpsQuery,type MobileGpsHistoryQuery} from '../../../shared/mobile-gps';

function useGpsRead<T>(family:string,encoded:string,read:(signal:AbortSignal)=>Promise<T>,enabled:boolean,interval=GPS_POLL_INTERVAL_MS,staleTime=30_000) {
  const {api,session}=useSession(),cache=useQueryClient();
  const queryKey=useMemo(()=>[family,api?.origin,session?.user.id,session?.user.storeId,session?.user.allStores,encoded],[family,api?.origin,session?.user.id,session?.user.storeId,session?.user.allStores,encoded]);
  const query=useQuery({queryKey,queryFn:({signal})=>read(signal),enabled:false,retry:false,staleTime,refetchOnWindowFocus:false,placeholderData:previous=>previous});
  const {refetch}=query;
  useFocusEffect(useCallback(()=>{
    if(!api||!session||!enabled||!session.user.permissions.includes('vehicles.read'))return;
    const refresh=()=>{
      if(AppState.currentState!=='active')return;
      const state=cache.getQueryState(queryKey);
      if(interval===0&&state?.data&&!state.isInvalidated&&Date.now()-state.dataUpdatedAt<staleTime)return;
      void refetch({cancelRefetch:false});
    };
    refresh();const timer=interval>0?setInterval(refresh,interval):undefined;
    const subscription=AppState.addEventListener('change',state=>{if(state==='active')refresh();else void cache.cancelQueries({queryKey,exact:true});});
    return()=>{if(timer)clearInterval(timer);subscription.remove();void cache.cancelQueries({queryKey,exact:true});};
  },[api,session,enabled,interval,staleTime,refetch,cache,queryKey]));
  return query;
}
export function useGps(filters:MobileGpsQuery,enabled=true) {
  const {api}=useSession();
  const query={...filters,event_source:'all' as const,event_device:''};
  return useGpsRead('gps-devices',gpsQueryString(query),signal=>api!.gpsDevices(query,signal),enabled);
}
export function useGpsHistory(filters:MobileGpsQuery,enabled:boolean) {
  const {api}=useSession();
  const query:MobileGpsHistoryQuery={store:filters.store,event_source:filters.event_source,event_device:filters.event_device};
  return useGpsRead('gps-history',new URLSearchParams(query).toString(),signal=>api!.gpsHistory(query,signal),enabled);
}
export function useGpsEventOptions(store:string,enabled:boolean) {
  const {api}=useSession();
  return useGpsRead('gps-event-options',store,signal=>api!.gpsEventOptions(store,signal),enabled,0,300_000);
}
export function useGpsSyncState(enabled:boolean) {
  const {api}=useSession();
  return useGpsRead('gps-sync-state','',signal=>api!.gpsSyncState(signal),enabled,2000,0);
}
