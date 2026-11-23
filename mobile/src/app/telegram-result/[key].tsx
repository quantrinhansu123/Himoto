import {useEffect,useMemo,useRef,useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,useLocalSearchParams,usePreventRemove} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {NOTICE_STATUS_LABELS} from '../../../../shared/contract-telegram';
import {isTelegramOperation,type MobileTelegramResult} from '../../../../shared/mobile-telegram';
import {isImportUuid} from '../../../../shared/mobile-customer-import';
import {useSession} from '@/providers/session';
import {pendingWrites} from '@/lib/pending-writes';
import {useTheme} from '@/theme';
import {Button,Card,InfoBanner,InlineError,KeyValueRow,StateView,StatusBadge} from '@/components/ui';
import {ConfirmEdit} from '@/components/editor-sheet';
type PendingItem=Awaited<ReturnType<typeof pendingWrites.list>>[number];
function Result({requestKey}:{requestKey:string}){
  const {api,session}=useSession(),theme=useTheme(),cache=useQueryClient();
  const scope=useMemo(()=>({origin:api!.origin,userId:session!.user.id,storeId:session!.user.allStores?null:session!.user.storeId,allStores:session!.user.allStores}),[api,session]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState(false),alive=useRef(true),running=useRef(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);const disable=usePreventRemove(busy,()=>{});
  const query=useQuery<{pending:PendingItem|undefined;result:MobileTelegramResult|null}>({queryKey:['telegram-result',scope,requestKey],retry:false,staleTime:1500,gcTime:60_000,queryFn:async({signal})=>{
    const pending=(await pendingWrites.list(scope,true)).find(p=>p.key===requestKey),value=(await api!.telegramResult(requestKey,signal)).result;
    if(pending&&!isTelegramOperation(pending.operation)||value&&pending&&value.operation!==pending.operation)throw Error('Xác nhận Telegram không khớp mã gốc.');return{pending,result:value};
  },refetchInterval:q=>{
    if(busy)return false;
    const current=q.state.data?.result;
    const active=current?.transfer?['pending','sending'].includes(current.transfer.status||''):current?.contract?.events.some(e=>['pending','sending','retracting'].includes(e.status||''));
    return active?2000:false;
  },refetchIntervalInBackground:false});
  const value=query.data?.result,text={color:theme.text,fontSize:15,lineHeight:22},muted={color:theme.muted,fontSize:13,lineHeight:20};
  async function resolve(){setConfirm(false);const entry=query.data?.pending;if(!entry||running.current)return;running.current=true;setBusy(true);setError('');try{const result=await api!.resolveWrite(requestKey,entry.operation);if(!alive.current)return;if(result.status==='cancelled'){await pendingWrites.complete(scope,entry.operation,requestKey);if(!alive.current)return;setNotice('Máy chủ xác nhận chưa ghi yêu cầu này. Mã cũ đã khóa; tải lại hồ sơ trước khi thao tác tiếp.');}await query.refetch();}catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}}
  async function acknowledge(){if(!value||running.current)return;running.current=true;setBusy(true);setError('');try{const original=await pendingWrites.entryScope(scope,value.operation,requestKey);if(original)await pendingWrites.complete(original,value.operation,requestKey);if(!alive.current)return;void cache.invalidateQueries({queryKey:['telegram']});disable();if(value.transfer)router.replace({pathname:'/transfer-telegram/[id]/[eventId]',params:{id:String(value.id),eventId:String(value.eventId)}});else router.replace({pathname:'/contract-telegram/[id]',params:{id:String(value.id)}});}catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}}
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>
    <ScrollView contentContainerStyle={{padding:16,paddingBottom:36,gap:12,maxWidth:760,width:'100%',alignSelf:'center'}}>
      {!!error&&<InlineError message={error}/>}
      {!!notice&&<InfoBanner tone="info" message={notice}/>}
      {query.isPending?<StateView title="Đang đọc xác nhận Telegram" loading/>:query.isError?<StateView title="Chưa đọc được xác nhận Telegram" message={query.error.message} retry={()=>void query.refetch()}/>:value?<>
        <Card style={{gap:10}}>
          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
            <Text accessibilityRole="header" style={{color:theme.success,fontSize:20,fontWeight:'800',flexShrink:1}}>Máy chủ đã ghi nhận yêu cầu Telegram</Text>
            <StatusBadge label={{send:'Xếp gửi',resume:'Gửi tiếp',retry_confirmed_absent:'Gửi lại',retract:'Thu hồi'}[value.action]} tone="info"/>
          </View>
          <KeyValueRow label="Thao tác" value={{send:'Xếp gửi',resume:'Gửi tiếp phần còn thiếu',retry_confirmed_absent:'Gửi lại sau khi đối chiếu',retract:'Thu hồi lần gửi'}[value.action]}/>
          <Text selectable style={{color:theme.muted,fontSize:12}}>Mã gốc: {requestKey}</Text>
          <InfoBanner tone="info" message="Đây là xác nhận máy chủ nhận yêu cầu; trạng thái Telegram bên dưới là hiện tại. Cần Telegram xác nhận đầy đủ trước khi coi là đã gửi hoặc đã thu hồi."/>
        </Card>
        {value.transfer&&<Card style={{gap:8}}>
          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
            <Text style={{...text,fontWeight:'700',flexShrink:1}}>{value.transfer.destination_label}</Text>
            <StatusBadge label={value.transfer.status?NOTICE_STATUS_LABELS[value.transfer.status]||value.transfer.status:'Chưa gửi'} tone={value.transfer.status==='sent'?'success':value.transfer.status==='failed'?'danger':'info'}/>
          </View>
          <Text selectable style={text}>{value.transfer.text}</Text>
        </Card>}
        {value.contract?.events.map(e=><Card key={e.key} style={{gap:8}}>
          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
            <Text style={{...text,fontWeight:'700',flexShrink:1}}>{e.label}</Text>
            <StatusBadge label={e.status?NOTICE_STATUS_LABELS[e.status]||e.status:'Chưa gửi'} tone={e.status==='sent'?'success':e.status==='failed'?'danger':'info'}/>
          </View>
          <KeyValueRow label="Đích nhận" value={e.destination_label}/>
          <KeyValueRow label="Tệp đính kèm" value={`${e.photo_count} ảnh · ${e.video_count||0} video`}/>
        </Card>)}
        <Button label="Đã kiểm tra xác nhận Telegram" loading={busy} onPress={()=>void acknowledge()}/>
      </>:query.data?.pending?<Card style={{gap:10}}><Text style={text}>Chưa đọc được xác nhận. Giữ mã gốc và đối chiếu trước khi gửi thêm.</Text><Button label="Đối chiếu thao tác Telegram" loading={busy} onPress={()=>setConfirm(true)}/></Card>:<Card><Text style={muted}>Chưa có xác nhận hoặc mã chờ trên thiết bị. Không tự gửi thêm từ màn này.</Text></Card>}
      <Button secondary label="Tải lại xác nhận Telegram" loading={query.isFetching} disabled={busy} onPress={()=>void query.refetch()}/>
    </ScrollView>
    {confirm&&<ConfirmEdit title="Đối chiếu thao tác Telegram?" message="Nếu đã ghi, đọc xác nhận gốc. Nếu chưa ghi, khóa mã cũ. Không tự tạo lượt gửi mới." confirmLabel="Đối chiếu với máy chủ" busy={busy} onCancel={()=>setConfirm(false)} onConfirm={()=>void resolve()}/>}
  </SafeAreaView>;
}
export default function Screen(){const{key}=useLocalSearchParams<{key:string}>(),{api,session}=useSession();if(!api||!session||!isImportUuid(key))return <StateView title="Không mở được mã Telegram"/>;return <Result key={[api.origin,session.token,session.user.storeId,session.user.allStores,key].join('|')} requestKey={key}/>;}
