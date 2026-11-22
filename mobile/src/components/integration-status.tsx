import { Text, View } from 'react-native';
import { useTheme,dateTime } from '@/theme';
import { Card, KeyValueRow, StatusBadge } from './ui';
import { CONTRACT_EVENT_LABELS,NOTICE_STATUS_LABELS,type ContractEventType } from '../../../shared/contract-telegram';
import type { IntegrationSettings } from '../../../shared/mobile-integrations';
export function IntegrationStatus({settings:r,section}:{settings:IntegrationSettings;section:'gps'|'history'|'notices'}){
  const theme=useTheme();
  if(section==='gps')return <Card style={{gap:8,padding:14}}>
    <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8}}>
      <Text style={{color:theme.text,fontSize:16,fontWeight:'800'}}>Lịch đồng bộ Cloud</Text>
      <StatusBadge status={r.scheduler?.enabled?'active':'inactive'} label={r.scheduler?.enabled?'Đang bật':'Đang tắt'}/>
    </View>
    <Text style={{color:theme.muted,fontSize:13,lineHeight:19}}>{r.scheduler?.enabled?'Lịch cloud đang bật, tiếp tục chạy khi điện thoại đóng ứng dụng.':'Lịch cloud đang tắt. Màn GPS và danh sách xe yêu cầu đồng bộ theo lịch hiện có.'}</Text>
    {r.scheduler?.last_response_at&&<KeyValueRow label="Kiểm tra gần nhất" value={`${dateTime(r.scheduler.last_response_at)} · HTTP ${r.scheduler.last_http_status??'—'}${r.scheduler.last_error_code?` · ${r.scheduler.last_error_code}`:''}`}/>}
  </Card>;
  if(section==='history'){const h=r.gps_history;return <>
    <Card style={{gap:6,padding:14}}>
      <Text style={{color:theme.text,fontSize:16,fontWeight:'800'}}>Nhật ký sự kiện GPS</Text>
      <KeyValueRow label="Luồng đọc thành công" value={`${h.completed_streams}/${h.streams} luồng`} emphasize/>
      <KeyValueRow label="Sự kiện đọc bù / trực tiếp" value={`${h.history_events} đọc bù · ${h.webhook_events} trực tiếp`}/>
      <KeyValueRow label="Chậm >15p / Cần kiểm tra" value={`${h.behind_streams} chậm · ${h.failed_streams} lỗi · ${h.waiting_webhooks} chờ`}/>
      {h.inaccessible_streams>0&&<KeyValueRow label="Luồng tạm dừng" value={`${h.inaccessible_streams} luồng`} valueColor={theme.warning}/>}
      {h.last_success_at&&<KeyValueRow label="Đọc bù gần nhất" value={dateTime(h.last_success_at)}/>}
    </Card>
    {h.channels.map(c=><Card key={c.id} style={{gap:6,padding:14}}>
      <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8}}>
        <Text style={{color:theme.text,fontSize:15.5,fontWeight:'800',flex:1}}>{c.label}</Text>
        <StatusBadge status={c.last_error?'warning':'active'} label={c.provider.toUpperCase()}/>
      </View>
      <KeyValueRow label="Chuyển động / Cảnh báo" value={`${c.motion_enabled?'Đã bật':'Chưa bật'} / ${c.alarms_enabled?'Đã bật':'Chưa bật'}`}/>
      <KeyValueRow label="Webhook trực tiếp" value={c.webhook_enabled?'Đã cấu hình':'Chưa cấu hình'}/>
      {c.last_webhook_at&&<KeyValueRow label="Sự kiện gần nhất" value={dateTime(c.last_webhook_at)}/>}
      {c.last_error&&<KeyValueRow label="Cần kiểm tra" value={c.last_error} valueColor={theme.warning}/>}
    </Card>)}
  </>;}
  return <>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:16,fontWeight:'800'}}>Thông báo Telegram gần nhất</Text>
    {r.notifications.length?r.notifications.map(n=><Card key={n.id} style={{gap:6,padding:14}}>
      <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8}}>
        <Text style={{color:theme.primary,fontSize:15,fontWeight:'800',flex:1}}>{n.code||'Chưa có mã hợp đồng'}</Text>
        <StatusBadge status={n.status==='sent'?'completed':n.status==='failed'?'danger':n.status||'pending'} label={NOTICE_STATUS_LABELS[n.status]||n.status}/>
      </View>
      <KeyValueRow label="Loại giao dịch" value={n.event_type==='vehicle_transfer'?'Điều chuyển xe sở hữu':n.event_type==='vehicle_receive'?'Nhận xe sở hữu':CONTRACT_EVENT_LABELS[n.event_type as ContractEventType]||n.event_type}/>
      <KeyValueRow label="Tệp / Thời điểm" value={`${n.photos} ảnh · ${dateTime(n.created_at)}`}/>
      {!!n.error_code&&<KeyValueRow label="Mã lỗi" value={n.error_code} valueColor={theme.danger}/>}
    </Card>):<Card><Text style={{color:theme.muted,fontSize:13.5,lineHeight:20}}>Chưa có thông báo. Giao dịch và ảnh được giữ; chỉ gửi Telegram sau khi xác nhận gửi ở luồng tương ứng.</Text></Card>}
  </>;
}
