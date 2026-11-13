import {useState} from 'react';
import {ScrollView,Text} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {nextPhotoInGroup} from '../../../shared/photo-slot-groups';
import {useSession} from '@/providers/session';
import {useTheme} from '@/theme';
import {Button,InlineError,StateView} from './ui';
import {PhotoBatch} from './photo-batch';

type BillScreenProps={id:string;backfill?:boolean;returnToRenewal?:boolean;collection?:boolean;collectionVersion?:string;returnToCollection?:boolean};
export function RenewalBillScreen(props:BillScreenProps){
  const{session}=useSession();
  if(!/^[1-9]\d{0,14}$/.test(props.id)||!session?.user.permissions.includes('contracts.read')||!session.user.permissions.includes(props.collection?'finance.write':'contracts.renew'))return <StateView title="Không mở được bill gia hạn" message="Kiểm tra quyền gia hạn hoặc quyền thu/chi."/>;
  return <BillAlbum key={`${session.user.id}:${props.id}:${props.collection}:${props.collectionVersion}:${props.backfill}`} {...props}/>;
}
function BillAlbum({id,collection=false,collectionVersion,returnToRenewal=false,returnToCollection=false,backfill=false}:BillScreenProps){
  const{api,session}=useSession(),theme=useTheme(),cache=useQueryClient();
  const[pending,setPending]=useState(true);
  const query=useQuery({queryKey:['bill-album',session!.user.id,id,collection,collectionVersion,backfill],queryFn:async({signal})=>{
    if(!collection){const data=await api!.renewalPreparation(id,1,'',signal,backfill);return{code:data.code,revision:data.revision,version:data.nextVersion,available:data.available,blockedReason:data.blockedReason};}
    if(!collectionVersion||!/^\d+$/.test(collectionVersion)||Number(collectionVersion)<2)throw Error('Mở kỳ gia hạn đã lưu để chọn bill khoản thu.');
    const data=await api!.renewalCollection(id,Number(collectionVersion),signal);return{code:data.code,revision:data.revision,version:data.period.version,available:data.available&&data.canWrite,blockedReason:data.blockedReason};
  },staleTime:0,refetchOnWindowFocus:false});
  if(!query.data)return <StateView title="Chuẩn bị bill gia hạn" loading={query.isPending} message={query.error?.message} retry={()=>{void query.refetch();}}/>;
  const data=query.data,base=`renewal-${data.version}-document-1`,operation=`${collection?'payment':'renewal'}.bill:${id}`;
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}><ScrollView contentContainerStyle={{padding:20,gap:18,maxWidth:760,width:'100%',alignSelf:'center'}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>{data.code} · Bill gia hạn #{data.version}</Text>
    <Text style={{color:theme.muted,lineHeight:24}}>Chọn cả bộ bill, xem hoặc bỏ từng ảnh, rồi lưu. Ảnh được gắn vào đúng kỳ; bước này chưa ghi tiền hay gia hạn. Ảnh cũ được giữ.</Text>
    {!data.available&&<InlineError message={data.blockedReason||'Hợp đồng chưa thể thao tác.'}/>}
    <PhotoBatch key={`${id}:${data.version}`} disabled={!data.available} adapter={{identity:`bill:${id}:${data.version}:${collection}`,label:'Bộ ảnh bill gia hạn',operation,conflicts:[operation,`renewal.record:${id}`,`payment.renewal:${id}`],
      prepare:async row=>{const target={entity:'contracts' as const,id:Number(id),kind:'renewal' as const,referenceId:data.version};let info=await api!.mediaSlotInfo(target,row.slot);while(info.photo){if(!info.nextSlot)throw Error('Nhóm ảnh đã đầy.');info=await api!.mediaSlotInfo(target,info.nextSlot);}const fresh=collection?await api!.renewalCollection(id,data.version):await api!.renewalPreparation(id,1,'',undefined,backfill);if('nextVersion'in fresh&&fresh.nextVersion!==data.version)throw Error('Kỳ gia hạn đã đổi. Giữ bộ ảnh và mở đúng kỳ gốc.');return{revision:fresh.revision,slot:info.slot};},
      upload:async(row,attempt,bytes)=>{const info=attempt as {revision:string;slot:string};const proof=collection?await api!.uploadCollectionBill(id,data.version,info.revision,null,bytes,row.key,info.slot):await api!.uploadRenewalBill(id,data.version,info.revision,null,bytes,row.key,backfill,info.slot);if(proof.id!==Number(id)||proof.slot!==info.slot)throw Error('Bill trả về không khớp hồ sơ gốc.');},
    }} nextSlot={rows=>nextPhotoInGroup(base,rows.map(r=>r.slot))} onPendingChange={setPending} onSaved={()=>{for(const key of ['renewal-preparation','renewal-collection','record-media'])void cache.invalidateQueries({queryKey:[key]});}}/>
    {pending&&<Text style={{color:theme.muted,lineHeight:24}}>Lưu hoặc bỏ ảnh chưa gửi trước khi tiếp tục nghiệp vụ. Bộ ảnh đang soạn được giữ trên máy nếu cần quay lại sau.</Text>}
    <Button label={collection?'Quay lại khoản thu đã chọn':'Quay lại gia hạn'} secondary disabled={pending} onPress={()=>{if(collection&&returnToCollection)router.dismissTo({pathname:'/renewal-payment/[id]',params:{id,version:String(data.version)}});else if(returnToRenewal)router.dismissTo({pathname:'/renewal/[id]',params:{id,...(backfill?{backfill:'1'}:{})}});else router.back();}}/>
    <Button secondary label="Xem và gửi bộ ảnh Telegram sau khi lưu nghiệp vụ" onPress={()=>router.push({pathname:'/contract-telegram/[id]',params:{id}})}/>
  </ScrollView></SafeAreaView>;
}
