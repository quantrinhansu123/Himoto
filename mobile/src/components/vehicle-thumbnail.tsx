import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Car } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';

export function VehicleThumbnail({id,revision}:{id:number;revision?:string|null}) {
  const {api,session}=useSession(),theme=useTheme();
  const target={entity:'vehicles' as const,id,kind:'vehicle' as const,referenceId:id};
  const query=useQuery({queryKey:['record-media','vehicle-thumbnail',api?.origin,session?.user.id,session?.user.storeId,session?.user.allStores,id],queryFn:({signal})=>api!.mediaSlotInfo(target,'vehicle-photo',signal),enabled:!!api&&revision===undefined,retry:false,staleTime:30000});
  const info=query.data,photo=info?.photo;
  const source=revision&&api?api.vehicleThumbnailSource(id,revision):revision===undefined&&info&&photo?.kind==='image'&&photo.readable?api!.recordMediaImageSource(info.target,photo):null;
  return <View style={{width:76,height:64,borderRadius:12,overflow:'hidden',backgroundColor:theme.background,alignItems:'center',justifyContent:'center'}}>
    {source?<ThumbnailImage key={`${source.uri}:${query.dataUpdatedAt}`} source={source}/>:<Car size={28} color={theme.muted} accessibilityLabel={query.isFetching?'Đang tải ảnh xe':query.isError?'Chưa tải được ảnh xe':'Chưa có ảnh xe'}/>}
  </View>;
}
function ThumbnailImage({source}:{source:{uri:string;headers?:Record<string,string>}}) {
  const theme=useTheme(),[failed,setFailed]=useState(false);
  return failed?<Car size={28} color={theme.muted} accessibilityLabel="Chưa tải được ảnh xe"/>:<Image source={source} recyclingKey={source.uri} cachePolicy="none" contentFit="cover" accessibilityLabel="Ảnh xe" style={{width:'100%',height:'100%'}} onError={()=>setFailed(true)}/>;
}
