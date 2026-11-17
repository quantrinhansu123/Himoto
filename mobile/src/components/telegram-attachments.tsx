import {useState} from 'react';
import {Text,View} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import {router} from 'expo-router';
import {isMobileMediaSlot,type MobileMediaIdentity,type MobileMediaPhoto} from '../../../shared/mobile-record-media';
import type {ContractTelegramAttachment} from '../../../shared/contract-telegram';
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
export function TelegramAttachments({id,attachments,version,disabled}:{id:number;attachments:ContractTelegramAttachment[];version:string;disabled:boolean}){
  const [page,setPage]=useState(1),theme=useTheme(),pages=Math.max(1,Math.ceil(attachments.length/10));
  return <View style={{gap:14}}>{attachments.slice((page-1)*10,page*10).map(photo=><Attachment key={`${photo.slot}:${version}`} target={targetForSlot(id,photo.slot)} attachment={photo} disabled={disabled}/>)}{!attachments.length&&<Text style={{color:theme.muted}}>Giao dịch chưa có ảnh hoặc video đã lưu.</Text>}{pages>1&&<><Text style={{color:theme.muted}}>Tệp · trang {page}/{pages}</Text><Button secondary label="Trang tệp trước" disabled={disabled||page<=1} onPress={()=>setPage(page-1)}/><Button secondary label="Trang tệp tiếp" disabled={disabled||page>=pages} onPress={()=>setPage(page+1)}/></>}</View>;
}
function Attachment({target,attachment,disabled}:{target:MobileMediaIdentity|null;attachment:ContractTelegramAttachment;disabled:boolean}){
  const {api,session}=useSession(),theme=useTheme(),{slot,label}=attachment;
  const directPhoto:MobileMediaPhoto|null=target&&attachment.revision?{
    slot,label,revision:attachment.revision,mimeType:attachment.mime_type,bytes:attachment.bytes??null,
    updatedAt:attachment.updated_at||new Date(0).toISOString(),
    kind:attachment.mime_type==='video/mp4'&&/-video-[1-3]$/.test(slot)?'video':['image/jpeg','image/png','image/webp'].includes(attachment.mime_type)&&!/-video-[1-3]$/.test(slot)?'image':'unknown',
    readable:attachment.readable!==false,blockedReason:attachment.blocked_reason??null,
  }:null;
  const query=useQuery({queryKey:['record-media','telegram-attachment',api?.origin,session?.user.id,session?.user.storeId,session?.user.allStores,target,slot],queryFn:({signal})=>api!.mediaSlotInfo(target!,slot,signal),enabled:!!target&&!directPhoto,retry:false,gcTime:0});
  const info=query.data,photo=directPhoto??info?.photo,mediaTarget=directPhoto?target:info?.target;
  return <Card style={{gap:12}}><Text style={{color:theme.text,fontWeight:'700',fontSize:17}}>{label}</Text>
    {!target?<Text style={{color:theme.muted}}>Mục tệp cũ cần kiểm tra trong hồ sơ hợp đồng.</Text>:!directPhoto&&query.isError?<><Text style={{color:theme.danger}}>{query.error.message}</Text><Button secondary label={`Tải lại tệp ${label}`} disabled={disabled} onPress={()=>void query.refetch()}/></>:!directPhoto&&!info?<Text style={{color:theme.muted}}>Đang đọc tệp đã lưu…</Text>:photo?.readable&&mediaTarget?photo.kind==='image'?<BillPhoto previewSource={api!.recordMediaImageSource(mediaTarget,photo,true)} source={api!.recordMediaImageSource(mediaTarget,photo)} label={label} context="gửi Telegram"/>:<RecordVideoPlayer source={api!.recordVideoSource(mediaTarget,photo)} label={label}/>:<Text style={{color:theme.muted}}>{photo?.blockedReason||'Tệp đã thay đổi hoặc không còn trong mục này. Tải lại nội dung Telegram trước khi gửi.'}</Text>}
    {target&&<Button secondary label={`Mở mục tệp ${label}`} disabled={disabled} onPress={()=>router.push({pathname:'/record-media/[entity]/[id]',params:{entity:target.entity,id:String(target.id),kind:target.kind,referenceId:String(target.referenceId)}})}/>}
  </Card>;
}
