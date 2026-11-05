import {useCallback,useState} from 'react';
import {ScrollView,Text} from 'react-native';
import {router,useFocusEffect,useLocalSearchParams} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {NOTICE_STATUS_LABELS} from '../../../../../shared/contract-telegram';
import {useSession} from '@/providers/session';
import {useTelegramWrite} from '@/hooks/use-telegram-write';
import {useTheme} from '@/theme';
import {Button,Card,InlineError,StateView} from '@/components/ui';
import {ConfirmEdit} from '@/components/editor-sheet';
function Telegram({id,eventId}:{id:string;eventId:string}){
  const {api,session}=useSession(),theme=useTheme(),write=useTelegramWrite(`telegram.transfer:${eventId}`),[focused,setFocused]=useState(false),[review,setReview]=useState<{hash:string;message:string}|null>(null),[resolving,setResolving]=useState(false);
  useFocusEffect(useCallback(()=>{setFocused(true);return()=>setFocused(false);},[]));
  const query=useQuery({queryKey:['telegram','transfer',api!.origin,session!.user.id,session!.user.storeId,session!.user.allStores,id,eventId],queryFn:({signal})=>api!.transferTelegram(id,eventId,signal),enabled:focused&&write.checked&&!write.key,retry:false,refetchInterval:q=>!write.busy&&['pending','sending'].includes(q.state.data?.status||'')?3000:false,refetchIntervalInBackground:false});
  const value=query.data,locked=write.busy||!!write.key||!write.checked,text={color:theme.text,fontSize:16,lineHeight:25},muted={color:theme.muted,fontSize:15,lineHeight:24};
  return <ScrollView contentContainerStyle={{padding:20,paddingBottom:40,gap:18,maxWidth:760,width:'100%',alignSelf:'center'}}>
    <Text accessibilityRole="header" style={{...text,fontSize:25,fontWeight:'800'}}>Telegram chuyển / nhận xe</Text><Text style={muted}>Thao tác kho đã lưu. Kiểm tra nội dung và các nhóm nhận trước khi gửi. Đóng màn hình không xếp thông báo mới.</Text>
    {!!write.error&&<InlineError message={write.error}/>}
    {!!write.notice&&<Text style={muted}>{write.notice}</Text>}
    {write.key?<Card style={{gap:14}}><Text style={text}>Thao tác Telegram cần đối chiếu trước khi gửi thêm.</Text><Button label="Đối chiếu thao tác Telegram" loading={write.busy} onPress={()=>setResolving(true)}/><Button secondary label="Mở xác nhận Telegram" disabled={write.busy} onPress={write.openResult}/></Card>:query.isPending?<StateView title="Đang đọc Telegram điều chuyển" loading/>:query.isError?<StateView title="Chưa đọc được Telegram điều chuyển" message={query.error.message} retry={()=>void query.refetch()}/>:value&&<Card style={{gap:14}}>
      <Text style={{...text,fontWeight:'700'}}>Nơi nhận: {value.destination_label||'Chưa xác định đủ cơ sở đi và đến'}</Text><Text selectable style={text}>{value.text}</Text><Text style={muted}>{value.status?NOTICE_STATUS_LABELS[value.status]||value.status:'Chưa gửi'} · {value.message_count} tin/tệp đã ghi nhận</Text>
      {value.status==='unknown'&&<InlineError message="Chưa rõ Telegram đã nhận hay chưa. Kiểm tra nhóm trước; hệ thống không tự gửi lại."/>}
      <Button secondary label="Kiểm tra ảnh lượt chuyển / nhận" disabled={locked||query.isFetching} onPress={()=>router.push({pathname:'/record-media/[entity]/[id]',params:{entity:'vehicles',id,kind:value.kind,referenceId:eventId}})}/>
      <Button label={value.status==='sent'?'Đã gửi Telegram điều chuyển':value.status==='pending'||value.status==='sending'?'Đang gửi Telegram điều chuyển':'Gửi Telegram chuyển / nhận xe'} disabled={locked||query.isFetching||!value.can_send} onPress={()=>setReview({hash:value.review,message:`Nơi nhận: ${value.destination_label}\n${value.text}\nChỉ gửi thông báo cho đúng lượt chuyển/nhận đang mở.`})}/>
    </Card>}
    <Button secondary label="Làm mới Telegram điều chuyển" loading={query.isFetching} disabled={locked} onPress={()=>void query.refetch()}/>
    {!write.checked&&<Button secondary label="Đọc lại mã Telegram" loading={write.busy} onPress={()=>void write.check()}/>}
    {review&&<ConfirmEdit title="Gửi Telegram điều chuyển?" message={review.message} confirmLabel="Xác nhận xếp gửi Telegram" onCancel={()=>setReview(null)} onConfirm={()=>{const hash=review.hash;setReview(null);void write.submit(key=>api!.saveTransferTelegram(id,eventId,hash,key));}}/>}
    {resolving&&<ConfirmEdit title="Đối chiếu yêu cầu Telegram?" message="Đọc xác nhận gốc nếu đã ghi; khóa mã cũ nếu chưa ghi. Xếp hàng chưa có nghĩa Telegram đã nhận tin." confirmLabel="Đối chiếu với máy chủ" onCancel={()=>setResolving(false)} onConfirm={()=>{setResolving(false);void write.resolve().then(cancelled=>{if(cancelled)void query.refetch();});}}/>}
    {write.exit&&<ConfirmEdit title="Rời Telegram điều chuyển?" busy={write.busy} message="Mã lần gửi vẫn được giữ để đối chiếu trong Tài khoản." confirmLabel="Rời Telegram điều chuyển" onCancel={write.dismissExit} onConfirm={write.leave}/>}
  </ScrollView>;
}
export default function Screen(){const{id,eventId}=useLocalSearchParams<{id:string;eventId:string}>(),{api,session}=useSession();if(!api||!session||typeof id!=='string'||typeof eventId!=='string'||![id,eventId].every(v=>/^[1-9]\d{0,14}$/.test(v))||!session.user.permissions.includes('vehicles.read'))return <StateView title="Không mở được Telegram điều chuyển"/>;return <Telegram key={[api.origin,session.token,session.user.storeId,session.user.allStores,id,eventId].join('|')} id={id} eventId={eventId}/>;}
