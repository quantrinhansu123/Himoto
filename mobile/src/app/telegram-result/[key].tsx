import {useEffect,useMemo,useRef,useState} from 'react';
import {ScrollView,Text} from 'react-native';
import {router,useLocalSearchParams,usePreventRemove} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {NOTICE_STATUS_LABELS} from '../../../../shared/contract-telegram';
import {isTelegramOperation} from '../../../../shared/mobile-telegram';
import {isImportUuid} from '../../../../shared/mobile-customer-import';
import {useSession} from '@/providers/session';
import {pendingWrites} from '@/lib/pending-writes';
import {useTheme} from '@/theme';
import {Button,Card,InlineError,StateView} from '@/components/ui';
import {ConfirmEdit} from '@/components/editor-sheet';
function Result({requestKey}:{requestKey:string}){
  const {api,session}=useSession(),theme=useTheme(),cache=useQueryClient();
  const scope=useMemo(()=>({origin:api!.origin,userId:session!.user.id,storeId:session!.user.allStores?null:session!.user.storeId,allStores:session!.user.allStores}),[api,session]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState(false),alive=useRef(true),running=useRef(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);const disable=usePreventRemove(busy,()=>{});
  const query=useQuery({queryKey:['telegram-result',scope,requestKey],retry:false,gcTime:0,queryFn:async({signal})=>{
    const pending=(await pendingWrites.list(scope,true)).find(p=>p.key===requestKey),value=(await api!.telegramResult(requestKey,signal)).result;
    if(pending&&!isTelegramOperation(pending.operation)||value&&pending&&value.operation!==pending.operation)throw Error('Xác nhận Telegram không khớp mã gốc.');return{pending,result:value};
  }});
  const value=query.data?.result,text={color:theme.text,fontSize:16,lineHeight:25},muted={color:theme.muted,fontSize:15,lineHeight:24};
  async function resolve(){setConfirm(false);const entry=query.data?.pending;if(!entry||running.current)return;running.current=true;setBusy(true);setError('');try{const result=await api!.resolveWrite(requestKey,entry.operation);if(!alive.current)return;if(result.status==='cancelled'){await pendingWrites.complete(scope,entry.operation,requestKey);if(!alive.current)return;setNotice('Máy chủ xác nhận chưa ghi yêu cầu này. Mã cũ đã khóa; tải lại hồ sơ trước khi thao tác tiếp.');}await query.refetch();}catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}}
  async function acknowledge(){if(!value||running.current)return;running.current=true;setBusy(true);setError('');try{const original=await pendingWrites.entryScope(scope,value.operation,requestKey);if(original)await pendingWrites.complete(original,value.operation,requestKey);if(!alive.current)return;void cache.invalidateQueries({queryKey:['telegram']});disable();if(value.transfer)router.replace({pathname:'/transfer-telegram/[id]/[eventId]',params:{id:String(value.id),eventId:String(value.eventId)}});else router.replace({pathname:'/contract-telegram/[id]',params:{id:String(value.id)}});}catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}}
  return <ScrollView contentContainerStyle={{padding:20,paddingBottom:40,gap:18,maxWidth:760,width:'100%',alignSelf:'center'}}>
    {!!error&&<InlineError message={error}/>}
    {!!notice&&<Text style={muted}>{notice}</Text>}
    {query.isPending?<StateView title="Đang đọc xác nhận Telegram" loading/>:query.isError?<StateView title="Chưa đọc được xác nhận Telegram" message={query.error.message} retry={()=>void query.refetch()}/>:value?<>
      <Card style={{gap:12}}><Text accessibilityRole="header" style={{...text,fontSize:23,fontWeight:'800'}}>Máy chủ đã ghi nhận yêu cầu Telegram</Text><Text style={text}>Thao tác: {{send:'Xếp gửi',resume:'Gửi tiếp phần còn thiếu',retry_confirmed_absent:'Gửi lại sau khi đối chiếu',retract:'Thu hồi lần gửi'}[value.action]}</Text><Text selectable style={muted}>Mã gốc: {requestKey}</Text><Text style={muted}>Đây là xác nhận máy chủ nhận yêu cầu; trạng thái Telegram bên dưới là hiện tại. Cần Telegram xác nhận đầy đủ trước khi coi là đã gửi hoặc đã thu hồi.</Text></Card>
      {value.transfer&&<Card style={{gap:12}}><Text style={text}>{value.transfer.destination_label}</Text><Text style={muted}>{value.transfer.status?NOTICE_STATUS_LABELS[value.transfer.status]||value.transfer.status:'Chưa gửi'}</Text><Text selectable style={text}>{value.transfer.text}</Text></Card>}
      {value.contract?.events.map(e=><Card key={e.key} style={{gap:10}}><Text style={{...text,fontWeight:'700'}}>{e.label}</Text><Text style={muted}>{e.status?NOTICE_STATUS_LABELS[e.status]||e.status:'Chưa gửi'} · {e.photo_count} ảnh · {e.video_count||0} video</Text><Text style={muted}>{e.destination_label}</Text></Card>)}
      <Button label="Đã kiểm tra xác nhận Telegram" loading={busy} onPress={()=>void acknowledge()}/>
    </>:query.data?.pending?<Card style={{gap:12}}><Text style={text}>Chưa đọc được xác nhận. Giữ mã gốc và đối chiếu trước khi gửi thêm.</Text><Button label="Đối chiếu thao tác Telegram" loading={busy} onPress={()=>setConfirm(true)}/></Card>:<Text style={muted}>Chưa có xác nhận hoặc mã chờ trên thiết bị. Không tự gửi thêm từ màn này.</Text>}
    <Button secondary label="Tải lại xác nhận Telegram" loading={query.isFetching} disabled={busy} onPress={()=>void query.refetch()}/>
    {confirm&&<ConfirmEdit title="Đối chiếu thao tác Telegram?" message="Nếu đã ghi, đọc xác nhận gốc. Nếu chưa ghi, khóa mã cũ. Không tự tạo lượt gửi mới." confirmLabel="Đối chiếu với máy chủ" busy={busy} onCancel={()=>setConfirm(false)} onConfirm={()=>void resolve()}/>}
  </ScrollView>;
}
export default function Screen(){const{key}=useLocalSearchParams<{key:string}>(),{api,session}=useSession();if(!api||!session||!isImportUuid(key))return <StateView title="Không mở được mã Telegram"/>;return <Result key={[api.origin,session.token,session.user.storeId,session.user.allStores,key].join('|')} requestKey={key}/>;}
