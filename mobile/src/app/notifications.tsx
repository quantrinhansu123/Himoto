import { useState } from 'react';
import { ScrollView, Text, View, Pressable, RefreshControl, Linking } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronRight } from 'lucide-react-native';
import { NOTIFICATION_LABELS } from '../../../shared/mobile-notifications';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';
import { Button, Card, InlineError, StateView } from '@/components/ui';
import { enableNativePush, nativePushConfigured, notificationsModule } from '@/lib/push-notifications';

export default function Notifications() {
  const {api, session} = useSession(), theme = useTheme();
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const query = useQuery({queryKey:['notifications',session?.user.id], queryFn:({signal})=>api!.notifications(signal), enabled:!!api, refetchInterval:60000});
  const push = useQuery({queryKey:['push-status',session?.user.id],queryFn:()=>api!.pushStatus(),enabled:!!api});
  async function toggle() {
    if (!api || busy) return;
    setBusy(true); setError('');
    try {
      if (push.data?.enabled) { await api.disablePush(); if (nativePushConfigured) await (await notificationsModule()).dismissAllNotificationsAsync(); }
      else await enableNativePush(api,true);
      await push.refetch();
    } catch (e) { setError(e instanceof Error ? e.message : 'Chưa cập nhật được thông báo. Vui lòng thử lại.'); }
    finally {setBusy(false);}
  }
  return <ScrollView contentContainerStyle={{padding:20,gap:20}} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={()=>{void query.refetch();void push.refetch();}} tintColor={theme.primary}/> }>
    <Card style={{gap:14}}><View style={{flexDirection:'row',gap:12,alignItems:'center'}}><Bell size={24} color={theme.primary}/><Text style={{color:theme.text,fontSize:20,fontWeight:'700',flex:1}}>Công việc cần xử lý</Text></View>
      <Text style={{color:theme.muted,lineHeight:22}}>Cập nhật theo quyền và cơ sở của tài khoản. Mở hồ sơ để kiểm tra trước khi thao tác.</Text>
      {query.data && <Text style={{color:theme.muted,fontSize:12}}>Cập nhật {new Date(query.data.observedAt).toLocaleTimeString('vi-VN')}</Text>}
    </Card>
    {query.isPending ? <StateView title="Đang tải công việc" loading/> : query.error ? <InlineError message={query.error.message}/> : query.data?.groups.length ? query.data.groups.map(group=><Pressable key={group.kind} accessibilityRole="button" accessibilityLabel={`${NOTIFICATION_LABELS[group.kind]}: ${group.count}`} onPress={()=>router.push({pathname:'/notification-list/[kind]',params:{kind:group.kind}})}><Card style={{flexDirection:'row',alignItems:'center',gap:12}}><View style={{flex:1,gap:6}}><Text style={{color:theme.text,fontSize:17,fontWeight:'600'}}>{NOTIFICATION_LABELS[group.kind]}</Text><Text style={{color:theme.muted,lineHeight:22}}>{group.count ? `${group.count} công việc` : 'Không có công việc cần xử lý'}</Text></View><ChevronRight size={20} color={theme.muted}/></Card></Pressable>) : <StateView title="Chưa có nhóm công việc" message="Tài khoản hiện không có quyền nhận các nhóm thông báo này."/>}
    {query.error && <Button secondary label="Tải lại công việc" onPress={()=>{void query.refetch();}}/>}
    <Card style={{gap:12}}><Text style={{color:theme.text,fontSize:18,fontWeight:'700'}}>Thông báo trên điện thoại</Text>
      <Text style={{color:theme.muted,lineHeight:22}}>{push.data?.enabled ? 'Đã bật cho phiên đăng nhập trên thiết bị này.' : 'Bật để nhận nhắc việc khi không mở Himoto.'} Nội dung trên màn hình khóa không chứa thông tin khách hàng.</Text>
      {!!error && <InlineError message={error}/>}
      {push.error ? <><InlineError message="Chưa kiểm tra được trạng thái thông báo."/><Button secondary label="Kiểm tra lại thông báo" onPress={()=>{void push.refetch();}}/></> : push.isPending ? <Text style={{color:theme.muted}}>Đang kiểm tra…</Text> : !push.data?.configured ? <Text style={{color:theme.muted,lineHeight:22}}>Hệ thống đang chuẩn bị thông báo đẩy. Anh/chị vẫn xem được công việc tại đây.</Text> : !nativePushConfigured ? <Text style={{color:theme.muted,lineHeight:22}}>Cập nhật bản cài Himoto để bật thông báo đẩy.</Text> : <><Button label={push.data.enabled?'Tắt thông báo trên thiết bị':'Bật thông báo trên thiết bị'} secondary={push.data.enabled} loading={busy} onPress={()=>{void toggle();}}/><Button secondary label="Mở cài đặt thông báo" onPress={()=>{void Linking.openSettings().catch(()=>setError('Không mở được Cài đặt điện thoại.'));}}/></>}
    </Card>
  </ScrollView>;
}
