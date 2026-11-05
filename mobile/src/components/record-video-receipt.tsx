import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { videoOperation, type MobileVideoReceipt } from '../../../shared/mobile-video';
import { useSession } from '@/providers/session';
import { pendingWrites } from '@/lib/pending-writes';
import { dateTime, useTheme } from '@/theme';
import { Button, Card, InlineError, StateView } from './ui';
import { ConfirmEdit } from './editor-sheet';
import { RecordVideoPlayer } from './record-video-player';

export function RecordVideoReceipt({id}:{id:string}) {
  const {api,session}=useSession();
  if(!api||!session||!/^[1-9]\d{0,14}$/.test(id))return <StateView title="Không mở được phiếu video" message="Mở lại từ Tài khoản hoặc hồ sơ hợp đồng."/>;
  return <Receipt key={[api.origin,session.token,session.user.storeId,session.user.allStores,id].join('|')} id={Number(id)}/>;
}
function Receipt({id}:{id:number}) {
  const {api,session}=useSession(),theme=useTheme(),cache=useQueryClient(),operation=videoOperation(id);
  const scope=useMemo(()=>({origin:api!.origin,userId:session!.user.id,storeId:session!.user.allStores?null:session!.user.storeId,allStores:session!.user.allStores}),[api,session]);
  const [key,setKey]=useState<string|null>(null),[receipt,setReceipt]=useState<MobileVideoReceipt|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState(false),[epoch,setEpoch]=useState(0);
  const alive=useRef(false),running=useRef(false);
  const verify=useCallback((value:MobileVideoReceipt)=>{if(value.actorId!==scope.userId||value.id!==id)throw Error('Phiếu không khớp hồ sơ hoặc người lưu. Giữ mã để đối chiếu.');},[id,scope.userId]);
  const load=useCallback(async()=>{
    if(!api||running.current)return;running.current=true;setBusy(true);setError('');
    try{const pending=await pendingWrites.lookup(scope,operation);if(!alive.current)return;setKey(pending);setReceipt(null);
      if(pending){const found=await api.videoReceipt(pending);if(!alive.current)return;if(found.receipt)verify(found.receipt);setReceipt(found.receipt);}
    }catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}
  },[api,scope,operation,verify]);
  useFocusEffect(useCallback(()=>{alive.current=true;void load();return()=>{alive.current=false;};},[load]));
  async function resolve(){
    if(!api||!key||running.current)return;running.current=true;setBusy(true);setError('');setConfirm(false);
    try{const result=await api.resolveWrite(key,operation);if(!alive.current)return;
      if(result.status==='cancelled'){await pendingWrites.complete(scope,operation,key);if(!alive.current)return;setKey(null);setReceipt(null);setNotice('Chưa gắn video vào hồ sơ; mã cũ đã khóa. Có thể mở hồ sơ để tiếp tục.');}
      else{const found=await api.videoReceipt(key);if(!alive.current)return;if(!found.receipt)throw Error('Chưa đọc được phiếu video gốc. Giữ mã để tải lại.');verify(found.receipt);setReceipt(found.receipt);}
    }catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}
  }
  async function acknowledge(){
    if(!key||!receipt||receipt.requestId!==key||running.current)return;running.current=true;setBusy(true);setError('');
    try{verify(receipt);await pendingWrites.complete(scope,operation,key);if(!alive.current)return;void cache.invalidateQueries({queryKey:['record-media']});router.dismissTo({pathname:'/record-media/[entity]/[id]',params:{entity:'contracts',id:String(id)}});}
    catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}
  }
  const text={color:theme.muted,fontSize:16,lineHeight:25};
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}><ScrollView contentContainerStyle={{padding:20,gap:18,maxWidth:760,width:'100%',alignSelf:'center'}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>Phiếu lưu video</Text>
    {!!error&&<InlineError message={error}/>}{!!notice&&<Text accessibilityLiveRegion="polite" style={text}>{notice}</Text>}
    {receipt?<>
      <Card style={{gap:14}}><Text style={{color:theme.text,fontSize:19,fontWeight:'700'}}>{receipt.target.label}</Text><Text style={{color:theme.text,fontSize:17}}>{receipt.label}</Text><Text style={text}>{receipt.actorName} · {dateTime(receipt.recordedAt)}</Text><Text style={text}>{(receipt.bytes/1024/1024).toFixed(1)} MB · {Math.ceil(receipt.duration)} giây</Text>
        <Text selectable style={{...text,fontSize:13}}>Mã lần lưu: {receipt.requestId}</Text>
        {!receipt.current&&<InlineError message="Hồ sơ, lượt ghi nhận hoặc video đã thay đổi sau lần lưu. Đây là phiếu gốc; tải lại hồ sơ để xem trạng thái hiện tại."/>}
        {receipt.current&&<RecordVideoPlayer key={receipt.photoRevision+':'+epoch} source={api!.recordVideoSource(receipt.target,{slot:receipt.slot,label:receipt.label,revision:receipt.photoRevision,mimeType:'video/mp4',bytes:receipt.bytes,updatedAt:receipt.recordedAt,kind:'video',readable:true,blockedReason:null})} label="Video đã lưu vào hồ sơ"/>}
      </Card><Button label="Đã kiểm tra phiếu lưu video" disabled={busy} onPress={()=>void acknowledge()}/>
    </>:<Card style={{gap:14}}><Text style={text}>{key?'Giữ mã lần gửi để đối chiếu trước khi lưu thêm video.':'Không có lần lưu video đang chờ trên thiết bị này.'}</Text>{key&&<Button label="Đối chiếu video với máy chủ" loading={busy} onPress={()=>setConfirm(true)}/>}</Card>}
    <Button label="Tải lại phiếu video" secondary loading={busy} onPress={()=>{setEpoch(e=>e+1);void load();}}/>
    {!key&&<Button label="Mở hồ sơ ảnh và video" secondary disabled={busy} onPress={()=>router.dismissTo({pathname:'/record-media/[entity]/[id]',params:{entity:'contracts',id:String(id)}})}/>}
  </ScrollView>{confirm&&<ConfirmEdit title="Đối chiếu lưu video?" message="Nếu đã lưu, đọc đúng phiếu gốc. Nếu chưa lưu, khóa mã cũ trước khi cho phép gửi lại." confirmLabel="Đối chiếu với máy chủ" onCancel={()=>setConfirm(false)} onConfirm={()=>void resolve()}/>}</SafeAreaView>;
}
