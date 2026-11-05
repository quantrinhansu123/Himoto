import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { isMobileMediaIdentity, isMobileMediaSlot, type MobileMediaIdentity } from '../../../shared/mobile-record-media';
import { MOBILE_CONTRACT_VIDEO_SECONDS } from '../../../shared/mobile-video';
import { useSession } from '@/providers/session';
import { useRecordVideoWrite } from '@/hooks/use-record-video-write';
import { selectRecordVideo, type RecordVideo } from '@/lib/record-video';
import { dateTime, useTheme } from '@/theme';
import { Button, Card, InlineError, StateView } from './ui';
import { ConfirmEdit } from './editor-sheet';
import { RecordVideoPlayer } from './record-video-player';

export function RecordVideoEditor({id,kind,referenceId,slot}:{id:string;kind:string;referenceId:string;slot:string}) {
  const {api,session}=useSession(), target={entity:'contracts',id:Number(id),kind,referenceId:Number(referenceId)};
  if(!api||!session||!isMobileMediaIdentity(target)||!isMobileMediaSlot(target,slot)||!/-video-[1-3]$/.test(slot))return <StateView title="Không mở được video" message="Mở đúng mục video từ hồ sơ hợp đồng."/>;
  return <VideoForm key={[api.origin,session.token,session.user.storeId,session.user.allStores,id,kind,referenceId,slot].join('|')} target={target} slot={slot}/>;
}
function VideoForm({target,slot}:{target:MobileMediaIdentity;slot:string}) {
  const {api,session}=useSession(),theme=useTheme();
  const [video,setVideo]=useState<RecordVideo|null>(null),[picking,setPicking]=useState(false),[ready,setReady]=useState(false),[duration,setDuration]=useState(0),[error,setError]=useState(''),[confirm,setConfirm]=useState(false),[resolving,setResolving]=useState(false),[epoch,setEpoch]=useState(0);
  const alive=useRef(true),local=useRef<RecordVideo|null>(null),picker=useRef<AbortController|null>(null),pickingLock=useRef(false);
  const write=useRecordVideoWrite(target.id,!!video||picking),locked=write.busy||!!write.key||!write.checked||picking;
  const info=useQuery({queryKey:['record-media','video',api?.origin,session?.user.id,session?.user.storeId,session?.user.allStores,target,slot],queryFn:({signal})=>api!.mediaSlotInfo(target,slot,signal),enabled:write.checked&&!write.key,staleTime:0,gcTime:0,retry:false,refetchOnReconnect:false,refetchOnWindowFocus:false});
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;picker.current?.abort();local.current?.dispose();};},[]);
  const onReady=useCallback((value:boolean,seconds:number)=>{setReady(value);setDuration(seconds);},[]);
  async function pick(camera:boolean){
    if(locked||pickingLock.current)return;pickingLock.current=true;setPicking(true);setError('');const controller=new AbortController();picker.current=controller;
    try{const chosen=await selectRecordVideo(camera,controller.signal);if(!chosen)return;if(!alive.current){chosen.dispose();return;}local.current?.dispose();local.current=chosen;setReady(false);setDuration(0);setVideo(chosen);}
    catch(cause){if(alive.current)setError((cause as Error).message);}finally{pickingLock.current=false;if(alive.current)setPicking(false);}
  }
  const data=info.data,valid=ready&&Number.isFinite(duration)&&duration>0&&duration<=MOBILE_CONTRACT_VIDEO_SECONDS;
  const text={color:theme.muted,fontSize:16,lineHeight:25};
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>
    <ScrollView contentContainerStyle={{padding:20,gap:18,maxWidth:760,width:'100%',alignSelf:'center'}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>{data?.label||'Video hồ sơ'}</Text>
      {!!(error||write.error)&&<InlineError message={error||write.error}/>}{!!write.notice&&<Text accessibilityLiveRegion="polite" style={text}>{write.notice}</Text>}
      {write.stage&&<Text accessibilityLiveRegion="polite" style={text}>{write.stage}</Text>}
      {write.key?<Card style={{gap:14}}><Text style={{color:theme.text,fontSize:19,fontWeight:'700'}}>Video đang chờ đối chiếu</Text><Text style={text}>Giữ mã lần gửi đến khi đọc được phiếu gốc hoặc máy chủ xác nhận chưa lưu.</Text>
        <Button label="Đối chiếu lưu video" loading={write.busy} onPress={()=>setResolving(true)}/><Button label="Mở phiếu lưu video" secondary disabled={write.busy} onPress={write.openReceipt}/></Card>:<>
        {info.isError&&<InlineError message={info.error.message}/>}
        {data&&<>
          <Text style={{color:theme.text,fontSize:18,fontWeight:'700'}}>{data.target.label}</Text>
          <Card style={{gap:14}}><Text accessibilityRole="header" style={{color:theme.text,fontSize:20,fontWeight:'700'}}>Video hiện tại</Text>
            {data.photo&&<Text style={text}>{dateTime(data.photo.updatedAt)} · {data.photo.bytes?`${(data.photo.bytes/1024/1024).toFixed(1)} MB`:data.photo.mimeType}</Text>}
            {data.photo?.readable&&data.photo.kind==='video'?<RecordVideoPlayer key={data.photo.revision+':'+epoch} source={api!.recordVideoSource(data.target,data.photo)} label="Video hồ sơ hiện tại"/>:<Text style={text}>{data.photo?.blockedReason||'Mục này chưa có video.'}</Text>}
          </Card>
          {data.photo&&<Button label="Xóa tệp khỏi hồ sơ" secondary disabled={locked||!!video||info.isFetching||info.isError} onPress={()=>router.push({pathname:'/media-delete/[entity]/[id]',params:{entity:'contracts',id:String(target.id),kind:target.kind,referenceId:String(target.referenceId),slot}})}/>}
          <Card style={{gap:14}}><Text accessibilityRole="header" style={{color:theme.text,fontSize:20,fontWeight:'700'}}>Video sẽ lưu</Text><Text style={text}>Tối đa 45 MB và 60 giây. Hỗ trợ MP4, MOV, M4V và WebM.</Text>
            {video&&<><RecordVideoPlayer key={video.uri} source={{uri:video.uri,useCaching:false}} label="Video đang chọn" onReady={onReady}/><Text style={text}>{(video.size/1024/1024).toFixed(1)} MB · {duration>0?`${Math.ceil(duration)} giây`:'Đang đọc thời lượng'}</Text></>}
            {video&&ready&&!valid&&<InlineError message="Video hợp đồng cần có thời lượng từ trên 0 đến 60 giây. Chọn tệp khác."/>}
            <Button label="Chọn video" secondary loading={picking} disabled={locked} onPress={()=>void pick(false)}/><Button label="Quay video" secondary disabled={locked||Platform.OS==='web'} onPress={()=>void pick(true)}/>
          </Card>
          <Text style={text}>{data.photo?'Video đã chọn sẽ thay tệp hiện tại tại đúng mục này.':'Video được gắn vào đúng lượt ghi nhận đang mở.'}</Text>
          <Button label={data.photo?'Rà soát và thay video':'Rà soát và lưu video'} disabled={locked||!video||!valid||info.isFetching||info.isError} onPress={()=>setConfirm(true)}/>
        </>}
        <Button label="Tải lại mục video" secondary loading={info.isFetching} disabled={locked} onPress={()=>{setEpoch(e=>e+1);void info.refetch();}}/>
        {!write.checked&&<Button label="Đọc lại mã lưu video" secondary loading={write.busy} onPress={()=>void write.check()}/>}
      </>}
    </ScrollView>
    {confirm&&data&&video&&<ConfirmEdit title={data.photo?'Thay video trong hồ sơ?':'Lưu video vào hồ sơ?'} message={`${data.target.label} · ${data.label}. ${(video.size/1024/1024).toFixed(1)} MB · ${Math.ceil(duration)} giây.${data.photo?' Tệp hiện tại tại mục này sẽ được thay.':''}`} confirmLabel="Xác nhận lưu video" onCancel={()=>setConfirm(false)} onConfirm={()=>{setConfirm(false);void write.submit(data,video);}}/>}
    {resolving&&<ConfirmEdit title="Đối chiếu lưu video?" message="Nếu đã lưu, mở phiếu gốc. Nếu chưa lưu, khóa mã cũ trước khi cho phép gửi lại." confirmLabel="Đối chiếu với máy chủ" onCancel={()=>setResolving(false)} onConfirm={()=>{setResolving(false);void write.resolve().then(cancelled=>{if(cancelled&&alive.current)void info.refetch();});}}/>}
    {write.exit&&<ConfirmEdit title="Rời video hồ sơ?" busy={write.busy||picking} message={write.busy?'Đang xử lý video. Chờ xác nhận kết quả.':'Video chưa gửi sẽ cần chọn lại. Mã đã gửi vẫn được giữ để đối chiếu.'} confirmLabel="Rời video hồ sơ" onCancel={write.dismissExit} onConfirm={write.leave}/>}
  </SafeAreaView>;
}
