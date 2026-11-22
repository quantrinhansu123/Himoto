import {useScreenActive} from '@/hooks/use-screen-active';
import {useState} from 'react';
import {Text,View} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import {useSession} from '@/providers/session';
import {useTheme} from '@/theme';
import {Button,Card,InlineError,KeyValueRow,StatusBadge} from './ui';
import {ConfirmEdit} from './editor-sheet';
const labels:Record<string,string>={pending:'Chờ gửi',sending:'Đang gửi',sent:'Đã gửi',failed:'Gửi thất bại',unknown:'Chưa rõ kết quả gửi',awaiting_config:'Chưa cấu hình nhóm / bot'};
export function ShiftTelegramStatus({id,stage='pgd'}:{id:string;stage?:'pgd'|'audit'}){
  const{api,session}=useSession(),theme=useTheme(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false);
  const active=useScreenActive();
  const query=useQuery({queryKey:['shift-telegram',session!.user.id,id,stage],queryFn:({signal})=>api!.shiftTelegram(id,signal,stage),enabled:active,refetchIntervalInBackground:false,refetchInterval:q=>active&&q.state.data&&!q.state.data.suppressed&&['pending','sending'].includes(q.state.data.status)?4000:false});
  const canSend=stage==='audit'?session!.user.permissions.includes('shift.review'):session!.user.permissions.some(p=>p==='contracts.draft'||p==='finance.write');
  async function retry(){if(busy||!api)return;setBusy(true);setError('');setConfirm(false);try{await api.retryShiftTelegram(id,stage);void query.refetch();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const st=query.data?.status||'pending';
  return <Card style={{gap:8,padding:14}}>
    <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8}}>
      <Text style={{color:theme.text,fontSize:15.5,fontWeight:'800',flex:1}}>Telegram {stage==='audit'?'KTNB':'PGD'}</Text>
      <StatusBadge status={st==='sent'?'completed':st==='failed'?'danger':st} label={query.isPending?'Đang kiểm tra':query.data?labels[st]||st:'Chưa chốt'}/>
    </View>
    {query.data&&<KeyValueRow label="Tiến độ / Mã tin" value={`Đã gửi ${query.data.media_count??0}/${query.data.attachment_count??0} ảnh/video · #${query.data.message_id??'chờ'}`}/>}
    {query.data?.suppressed&&<Text style={{color:theme.muted,fontSize:13}}>Đã tạm dừng gửi Telegram để xử lý thu hồi.</Text>}
    {query.data?.status==='unknown'&&<Text style={{color:theme.muted,fontSize:13,lineHeight:19}}>Kiểm tra nhóm trước khi gửi thêm. Báo cáo được giữ; hệ thống không tự gửi lại tin chưa rõ kết quả.</Text>}
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
      {canSend&&query.data&&!query.data.suppressed&&['pending','failed','awaiting_config'].includes(query.data.status)&&<Button size="sm" equalWidth secondary label="Thử gửi tiếp Telegram" loading={busy} onPress={()=>setConfirm(true)}/>}
      <Button size="sm" equalWidth secondary label="Kiểm tra Telegram" loading={query.isFetching} onPress={()=>{void query.refetch();}}/>
    </View>
    {!!(error||query.error?.message)&&<InlineError message={error||query.error!.message}/>}
    {confirm&&<ConfirmEdit title="Thử gửi tiếp báo cáo ca?" message="Chỉ gửi phần ảnh/video chưa được xác nhận và nội dung báo cáo vào nhóm đã cấu hình. Tin chưa rõ kết quả không tự gửi lại." confirmLabel="Xác nhận gửi tiếp" onCancel={()=>setConfirm(false)} onConfirm={()=>{void retry();}}/>}
  </Card>;
}
