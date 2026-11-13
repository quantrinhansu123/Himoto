import {Text,View} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import {router} from 'expo-router';
import {useSession} from '@/providers/session';
import {stagedPhotoWork,stagedPhotoIdentity} from '@/lib/staged-photo-work';
import {useTheme} from '@/theme';
import {PhotoBatch} from './photo-batch';
import {Button,InlineError} from './ui';
export function StagedPhotoPicker({namespace,label,disabled,onBusyChange}:{namespace:string;label:string;disabled:boolean;onBusyChange:(busy:boolean)=>void}){
  const{api,session}=useSession(),theme=useTheme();
  const query=useQuery({queryKey:['staged-photo-work',api?.origin,session?.user.id,session?.user.storeId,session?.user.allStores,namespace],queryFn:()=>stagedPhotoWork({origin:api!.origin,userId:session!.user.id,storeId:session!.user.allStores?null:session!.user.storeId,allStores:session!.user.allStores},namespace),staleTime:0,gcTime:0});
  return <View style={{gap:12}}>{query.data?<>
    <PhotoBatch adapter={{identity:stagedPhotoIdentity(query.data.id),label,operation:'battery.media:1',conflicts:[],prepare:async()=>{throw Error('Lưu thông tin nghiệp vụ trước khi gắn ảnh.');},upload:async()=>{throw Error('Lưu thông tin nghiệp vụ trước khi gắn ảnh.');}}} allowSave={false} disabled={disabled||!!query.data.recordId} onBusyChange={onBusyChange} nextSlot={rows=>`battery-${rows.length+1}`}/>
    {!!query.data.recordId&&<><Text style={{color:theme.muted,lineHeight:24}}>Có bộ ảnh của lượt đã lưu. Mở phiếu gốc để hoàn tất trước khi tạo lượt mới.</Text>{query.data.requestKey&&<Button secondary label="Mở phiếu pin gốc để lưu tiếp ảnh" onPress={()=>router.push({pathname:'/battery-result/[key]',params:{key:query.data!.requestKey!}})}/>}</>}
  </>:query.isError?<InlineError message={query.error.message}/>:<Text style={{color:theme.muted}}>Đang kiểm tra bộ ảnh đã giữ…</Text>}</View>;
}
