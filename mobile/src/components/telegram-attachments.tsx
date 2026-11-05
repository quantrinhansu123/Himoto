import {useState} from 'react';
import {Text,View} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import {router} from 'expo-router';
import {isMobileMediaSlot,type MobileMediaIdentity} from '../../../shared/mobile-record-media';
import {useSession} from '@/providers/session';
import {useTheme} from '@/theme';
import {Button,Card} from './ui';
import {BillPhoto} from './bill-photo';
import {RecordVideoPlayer} from './record-video-player';
function targetForSlot(id:number,slot:string):MobileMediaIdentity|null{
  const match=/^(renewal-receipt|renewal|battery-swap|vehicle-swap|return|plate)-([1-9]\d{0,14})(?:-|$)/.exec(slot);
  const kinds={'renewal-receipt':'renewal_receipt','renewal':'renewal','battery-swap':'battery_swap','vehicle-swap':'swap','return':'return','plate':'plate'} as const;
  const target:MobileMediaIdentity={entity:'contracts',id,kind:match?kinds[match[1] as keyof typeof kinds]:'rental',referenceId:match?Number(match[2]):id};
  return isMobileMediaSlot(target,slot)?target:null;
}
export function TelegramAttachments({id,attachments,version,disabled}:{id:number;attachments:{slot:string;label:string;mime_type:string}[];version:string;disabled:boolean}){
  const [page,setPage]=useState(1),theme=useTheme(),pages=Math.max(1,Math.ceil(attachments.length/10));
  return <View style={{gap:14}}>{attachments.slice((page-1)*10,page*10).map(photo=><Attachment key={`${photo.slot}:${version}`} target={targetForSlot(id,photo.slot)} slot={photo.slot} label={photo.label} disabled={disabled}/>)}{!attachments.length&&<Text style={{color:theme.muted}}>Giao dịch chưa có ảnh hoặc video đã lưu.</Text>}{pages>1&&<><Text style={{color:theme.muted}}>Tệp · trang {page}/{pages}</Text><Button secondary label="Trang tệp trước" disabled={disabled||page<=1} onPress={()=>setPage(page-1)}/><Button secondary label="Trang tệp tiếp" disabled={disabled||page>=pages} onPress={()=>setPage(page+1)}/></>}</View>;
}
function Attachment({target,slot,label,disabled}:{target:MobileMediaIdentity|null;slot:string;label:string;disabled:boolean}){
  const {api,session}=useSession(),theme=useTheme();
  const query=useQuery({queryKey:['record-media','telegram-attachment',api?.origin,session?.user.id,session?.user.storeId,session?.user.allStores,target,slot],queryFn:({signal})=>api!.mediaSlotInfo(target!,slot,signal),enabled:!!target,retry:false,gcTime:0});
  const info=query.data,photo=info?.photo;
  return <Card style={{gap:12}}><Text style={{color:theme.text,fontWeight:'700',fontSize:17}}>{label}</Text>
    {!target?<Text style={{color:theme.muted}}>Mục tệp cũ cần kiểm tra trong hồ sơ hợp đồng.</Text>:query.isError?<><Text style={{color:theme.danger}}>{query.error.message}</Text><Button secondary label={`Tải lại tệp ${label}`} disabled={disabled} onPress={()=>void query.refetch()}/></>:!info?<Text style={{color:theme.muted}}>Đang đọc tệp đã lưu…</Text>:photo?.readable?photo.kind==='image'?<BillPhoto source={api!.recordMediaImageSource(info.target,photo)} label={label} context="gửi Telegram"/>:<RecordVideoPlayer source={api!.recordVideoSource(info.target,photo)} label={label}/>:<Text style={{color:theme.muted}}>{photo?.blockedReason||'Tệp đã thay đổi hoặc không còn trong mục này. Tải lại nội dung Telegram trước khi gửi.'}</Text>}
    {target&&<Button secondary label={`Mở mục tệp ${label}`} disabled={disabled} onPress={()=>router.push({pathname:'/record-media/[entity]/[id]',params:{entity:target.entity,id:String(target.id),kind:target.kind,referenceId:String(target.referenceId)}})}/>}
  </Card>;
}
