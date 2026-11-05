import {useCallback,useMemo} from 'react';
import {AppState} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useSession} from '@/providers/session';
import {GPS_POLL_INTERVAL_MS,gpsQueryString,type MobileGpsQuery} from '../../../shared/mobile-gps';

export function useGps(filters:MobileGpsQuery) {
  const {api,session}=useSession(),cache=useQueryClient(),encoded=gpsQueryString(filters);
  const queryKey=useMemo(()=>['gps',api?.origin,session?.user.id,session?.user.storeId,session?.user.allStores,encoded],[api?.origin,session?.user.id,session?.user.storeId,session?.user.allStores,encoded]);
  const query=useQuery({queryKey,queryFn:({signal})=>api!.gps(filters,signal),enabled:false,retry:false,refetchOnWindowFocus:false,placeholderData:previous=>previous});
  const {refetch}=query;
  useFocusEffect(useCallback(()=>{
    if(!api||!session)return;
    const read=()=>{if(AppState.currentState==='active')void refetch({cancelRefetch:false});};
    read();const timer=setInterval(read,GPS_POLL_INTERVAL_MS);
    const subscription=AppState.addEventListener('change',state=>{if(state==='active')read();else void cache.cancelQueries({queryKey,exact:true});});
    return()=>{clearInterval(timer);subscription.remove();void cache.cancelQueries({queryKey,exact:true});};
  },[api,session,refetch,cache,queryKey]));
  return query;
}
