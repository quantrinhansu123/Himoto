import {Text,View} from 'react-native';
import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useSession} from '@/providers/session';
import {useTheme} from '@/theme';
import {PhotoBatch} from './photo-batch';
import {BillPhoto} from './bill-photo';
import {Button,InlineError} from './ui';
import {BatteryTelegramStatus} from './battery-telegram-status';
export function BatteryPhotoBatch({id,eventKey,title,queueId,allowSave=true,onPendingChange}:{id:string;eventKey:string;title:string;queueId?:string;allowSave?:boolean;onPendingChange?:(pending:boolean)=>void}){
  const{api,session}=useSession(),theme=useTheme(),cache=useQueryClient();
  const[pending,setPending]=useState(true),[preview,setPreview]=useState<string|null>(null);
  const query=useQuery({queryKey:['battery-media',session!.user.id,id,eventKey],queryFn:({signal})=>api!.batteryMedia(id,eventKey,signal),retry:false});
  return <View style={{gap:14}}><Text accessibilityRole="header" style={{color:theme.text,fontSize:20,fontWeight:'700'}}>{title}</Text>
    {query.isError&&<InlineError message={query.error.message}/>}
    {query.data?.rows.map((file,index)=><View key={file.id} style={{gap:10}}><Button secondary label={`${preview===file.id?'Thu gọn':'Xem'} ảnh pin đã lưu ${index+1}`} onPress={()=>setPreview(preview===file.id?null:file.id)}/>{preview===file.id&&<BillPhoto context="pin / sạc" source={api!.batteryMediaSource(id,eventKey,file.id)} label={`Ảnh pin đã lưu ${index+1}`}/>}</View>)}
    <PhotoBatch key={`${id}:${eventKey}`} disabled={query.data?.canWrite!==true} allowSave={allowSave} adapter={{identity:queueId??`battery:${id}:${eventKey}`,label:'Ảnh và chứng từ của lượt pin / sạc',operation:`battery.media:${id}`,conflicts:['media','update','delete','renew','collect_renewal','return'].map(kind=>`battery.${kind}:${id}`),
      prepare:async row=>{if(row.recordId!==undefined&&row.recordId!==Number(id))throw Error('Bộ ảnh thuộc hồ sơ pin khác.');row.recordId=Number(id);const current=await api!.batteryMedia(id,eventKey);if(!current.canWrite)throw Error('Không có quyền lưu ảnh lượt pin này.');return{eventKey};},
      upload:async(row,_attempt,bytes)=>{await api!.saveBatteryMedia(id,eventKey,row.id,bytes,row.key);},
    }} nextSlot={rows=>`battery-${rows.length+1}`} onPendingChange={value=>{setPending(value);onPendingChange?.(value);}} onSaved={()=>{void query.refetch();void cache.invalidateQueries({queryKey:['battery-telegram']});}}/>
    <Button secondary label="Tải lại ảnh của lượt pin" loading={query.isFetching} onPress={()=>{void query.refetch();}}/>
    <BatteryTelegramStatus id={id} requestKey={eventKey} disabled={pending||!allowSave} title={query.data?.action==='renew'?'Telegram gia hạn pin':query.data?.action==='collect_renewal'?'Telegram thu nợ gia hạn pin':eventKey==='rental'?'Telegram thuê pin / sạc':'Telegram trả pin / sạc'}/>
  </View>;
}
