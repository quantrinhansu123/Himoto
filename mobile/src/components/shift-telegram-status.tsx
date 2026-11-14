import {useState} from 'react';
import {Text} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import {useSession} from '@/providers/session';
import {useTheme} from '@/theme';
import {Button,Card,InlineError} from './ui';
import {ConfirmEdit} from './editor-sheet';
const labels:Record<string,string>={pending:'Chờ gửi',sending:'Đang gửi',sent:'Đã gửi',failed:'Gửi thất bại',unknown:'Chưa rõ kết quả gửi',awaiting_config:'Chưa cấu hình nhóm / bot'};
export function ShiftTelegramStatus({id,stage='pgd'}:{id:string;stage?:'pgd'|'audit'}){
  const{api,session}=useSession(),theme=useTheme(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false);
  const query=useQuery({queryKey:['shift-telegram',session!.user.id,id,stage],queryFn:({signal})=>api!.shiftTelegram(id,signal,stage),refetchInterval:q=>q.state.data&&['pending','sending'].includes(q.state.data.status)?4000:false});
  const canSend=stage==='audit'?session!.user.permissions.includes('shift.review'):session!.user.permissions.some(p=>p==='contracts.draft'||p==='finance.write');
  async function retry(){if(busy||!api)return;setBusy(true);setError('');setConfirm(false);try{await api.retryShiftTelegram(id,stage);void query.refetch();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <Card style={{gap:12}}><Text style={{color:theme.text,fontSize:20,fontWeight:'700'}}>Telegram {stage==='audit'?'KTNB':'PGD'}: {query.isPending?'Đang kiểm tra':query.data?labels[query.data.status]||query.data.status:'Chốt báo cáo để gửi minh chứng'}</Text>
    {query.data&&<Text style={{color:theme.muted}}>Đã gửi {query.data.media_count??0}/{query.data.attachment_count??0} ảnh / video · Mã tin {query.data.message_id??'chờ xác nhận'}</Text>}
    {query.data?.status==='unknown'&&<Text style={{color:theme.muted,lineHeight:24}}>Kiểm tra nhóm trước khi gửi thêm. Báo cáo được giữ; hệ thống không tự gửi lại tin chưa rõ kết quả.</Text>}
    {canSend&&query.data&&['pending','failed','awaiting_config'].includes(query.data.status)&&<Button secondary label="Thử gửi tiếp Telegram báo cáo ca" loading={busy} onPress={()=>setConfirm(true)}/>}
    <Button secondary label="Kiểm tra Telegram báo cáo ca" loading={query.isFetching} onPress={()=>{void query.refetch();}}/>{!!(error||query.error?.message)&&<InlineError message={error||query.error!.message}/>}
    {confirm&&<ConfirmEdit title="Thử gửi tiếp báo cáo ca?" message="Chỉ gửi phần ảnh/video chưa được xác nhận và nội dung báo cáo vào nhóm đã cấu hình. Tin chưa rõ kết quả không tự gửi lại." confirmLabel="Xác nhận gửi tiếp" onCancel={()=>setConfirm(false)} onConfirm={()=>{void retry();}}/>}
  </Card>;
}
