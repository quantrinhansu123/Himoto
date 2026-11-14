import {useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {router,useLocalSearchParams} from 'expo-router';
import {ScrollView,Text} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSession} from '@/providers/session';
import {pendingWrites} from '@/lib/pending-writes';
import {bindStagedPhotos,completeStagedPhotos} from '@/lib/staged-photo-work';
import {useTheme} from '@/theme';
import {Button,Card,InlineError,StateView} from '@/components/ui';
import {BatterySummary} from '@/components/battery-summary';
import {BatteryPhotoBatch} from '@/components/battery-photo-batch';
function Result({requestKey}:{requestKey:string}){
  const{api,session}=useSession(),cache=useQueryClient(),theme=useTheme(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[checked,setChecked]=useState(false),[photosPending,setPhotosPending]=useState(true),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const scope={origin:api!.origin,userId:session!.user.id,storeId:session!.user.allStores?null:session!.user.storeId,allStores:session!.user.allStores};
  const query=useQuery({queryKey:['battery-result',session!.user.id,requestKey],queryFn:async({signal})=>{
    const result=await api!.batteryResult(requestKey,signal),action=/^battery[.](renew|collect_renewal|return):/.exec(result.operation)?.[1];
    const namespace=result.operation==='battery.create'?'battery-create':action?`battery-${result.receipt.id}-${action}`:null;
    const photoBatchId=namespace&&!result.deleted?await bindStagedPhotos(scope,result.receipt.id,requestKey,namespace):null;
    const metadataAcknowledged=!await pendingWrites.entryScope(scope,result.operation,requestKey);
    return{...result,photoBatchId,namespace,metadataAcknowledged,eventKey:result.operation==='battery.create'?'rental':requestKey};
  },retry:false});
  if(query.isPending)return <StateView title="Đang đối chiếu xác nhận pin / sạc" loading/>;
  if(query.isError)return <StateView title="Chưa đọc được xác nhận pin" message={query.error.message} retry={()=>{void query.refetch();}}/>;
  const result=query.data;
  const metadataChecked=checked||result.metadataAcknowledged;
  async function checkReceipt(){const original=await pendingWrites.entryScope(scope,result.operation,requestKey);if(original)await pendingWrites.complete(original,result.operation,requestKey);}
  async function confirmMetadata(){if(busy)return;setBusy(true);setError('');try{await checkReceipt();if(alive.current)setChecked(true);}catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setBusy(false);}}
  async function finish(){
    if(busy)return;setBusy(true);setError('');try{
      if(result.photoBatchId){if(!metadataChecked||photosPending)throw Error('Kiểm tra phiếu gốc và lưu hoặc bỏ ảnh chưa gửi trước khi hoàn tất.');await completeStagedPhotos(scope,result.receipt.id,requestKey,result.namespace!);}
      else await checkReceipt();
      if(!alive.current)return;
      for(const key of [['batteries'],['battery'],['cashbook'],['cashbook-accounts'],['cashbook-account'],['cashbook-account-transactions']])void cache.invalidateQueries({queryKey:key});
      if(result.deleted)router.replace('/battery-contracts');else if(!result.photoBatchId&&result.namespace)router.replace({pathname:'/battery-media/[id]/[eventKey]',params:{id:String(result.receipt.id),eventKey:result.eventKey}});else router.replace({pathname:'/battery/[id]',params:{id:String(result.receipt.id)}});
    }catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setBusy(false);}
  }
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1}}><ScrollView contentContainerStyle={{padding:20,gap:18,maxWidth:760,width:'100%',alignSelf:'center'}}>
    <Card style={{gap:12}}><Text accessibilityRole="header" style={{color:theme.success,fontSize:23,fontWeight:'800'}}>Đã ghi nhận thao tác pin / sạc</Text><Text selectable style={{color:theme.muted,lineHeight:24}}>Mã gốc: {requestKey}{'\n'}Phiên bản tại lần ghi: {result.receipt.revision}</Text><Text style={{color:theme.muted,lineHeight:24}}>Nghiệp vụ đã lưu một lần. Bước ảnh và Telegram bên dưới không ghi lại tiền, gia hạn hoặc trả pin.</Text></Card>
    {result.current&&<BatterySummary record={result.current}/>}
    {result.photoBatchId&&!metadataChecked&&<Button label="Đã kiểm tra phiếu gốc, tiếp tục ảnh" loading={busy} onPress={()=>{void confirmMetadata();}}/>}
    {result.photoBatchId&&<BatteryPhotoBatch id={String(result.receipt.id)} eventKey={result.eventKey} title="Hoàn tất bộ ảnh và Telegram của lượt pin" queueId={result.photoBatchId} allowSave={metadataChecked} onPendingChange={setPhotosPending}/>}
    {!!error&&<InlineError message={error}/>}
    <Button label={result.photoBatchId?'Hoàn tất và về hồ sơ pin':'Đã kiểm tra xác nhận pin / sạc'} disabled={!!result.photoBatchId&&(!metadataChecked||photosPending)} loading={busy} onPress={()=>{void finish();}}/>
  </ScrollView></SafeAreaView>;
}
export default function Route(){const{key}=useLocalSearchParams<{key:string}>(),{api,session}=useSession();if(!api||!session||!/^[0-9a-f-]{36}$/.test(key))return <StateView title="Không mở được xác nhận pin"/>;return <Result key={`${key}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}`} requestKey={key}/>;}
