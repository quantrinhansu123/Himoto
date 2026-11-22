import { useScreenActive } from '@/hooks/use-screen-active';
import { useState } from 'react';
import { ScrollView, Text, View, Pressable, RefreshControl, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Bell, ChevronRight } from 'lucide-react-native';
import { NOTIFICATION_LABELS } from '../../../shared/mobile-notifications';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';
import { Button, Card, InlineError, SkeletonList, StateView, StatusBadge } from '@/components/ui';
import { enableNativePush, nativePushConfigured, notificationsModule } from '@/lib/push-notifications';

export default function Notifications() {
  const { api, session } = useSession(), theme = useTheme();
  const active = useScreenActive();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const query = useQuery({ queryKey: ['notifications', session?.user.id], queryFn: ({ signal }) => api!.notifications(signal), enabled: !!api && active, refetchInterval: active ? 60000 : false, refetchIntervalInBackground: false });
  const push = useQuery({ queryKey: ['push-status', session?.user.id], queryFn: () => api!.pushStatus(), enabled: !!api && active });
  async function toggle() {
    if (!api || busy) return;
    setBusy(true); setError('');
    try {
      if (push.data?.enabled) { await api.disablePush(); if (nativePushConfigured) await (await notificationsModule()).dismissAllNotificationsAsync(); }
      else await enableNativePush(api, true);
      await push.refetch();
    } catch (e) { setError(e instanceof Error ? e.message : 'Chưa cập nhật được thông báo. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  }
  async function test() {
    if (!api || busy) return; setBusy(true); setError(''); setNotice('');
    try { const result = await api.testPush(); setNotice(result.outcome === 'sent' ? 'Đã gửi thông báo thử. Kiểm tra thông báo Himoto trên điện thoại.' : 'Chưa xác nhận được kết quả gửi. Kiểm tra thông báo trên máy trước khi thử lại.'); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  return <SafeAreaView edges={['bottom','left','right']} style={{flex:1,backgroundColor:theme.background}}><ScrollView contentContainerStyle={{padding:16,paddingBottom:40,gap:12,maxWidth:760,width:'100%',alignSelf:'center'}} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={()=>{void query.refetch();void push.refetch();}} tintColor={theme.primary}/> }>
    <Card style={{gap:10,padding:14}}><View style={{flexDirection:'row',gap:10,alignItems:'center'}}><Bell size={20} color={theme.primary}/><Text style={{color:theme.text,fontSize:18,fontWeight:'800',flex:1}}>Công việc cần xử lý</Text>{query.data && <Text style={{color:theme.muted,fontSize:12}}>Cập nhật {new Date(query.data.observedAt).toLocaleTimeString('vi-VN')}</Text>}</View>
      <Text style={{color:theme.muted,fontSize:13,lineHeight:19}}>Ưu tiên hợp đồng quá hạn, sắp đến hạn trong 24 giờ và việc cần nhận hoặc duyệt.</Text>
      {(session?.user.permissions.includes('contracts.read') || session?.user.permissions.includes('finance.read')) && <Button size="sm" secondary label="Tiền về qua SePay" onPress={() => router.push('/payment-events')} />}
    </Card>
    {query.isPending ? <SkeletonList count={4} lines={2} /> : query.error ? <InlineError message={query.error.message} /> : query.data?.groups.length ? query.data.groups.map(group => {
      const isGps = group.kind === 'gps_alert';
      const hasAlert = isGps && group.count > 0;
      return <Pressable key={group.kind} accessibilityRole="button" accessibilityLabel={`${NOTIFICATION_LABELS[group.kind]}: ${group.count}`} onPress={() => router.push({ pathname: '/notification-list/[kind]', params: { kind: group.kind } })}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, ...(hasAlert ? { borderColor: theme.danger, borderWidth: 1.5, backgroundColor: theme.dangerBackground } : {}) }}>
          {isGps && <AlertTriangle size={20} color={hasAlert ? theme.danger : theme.muted} />}
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: hasAlert ? theme.danger : theme.text, fontSize: 16, fontWeight: '700' }}>{NOTIFICATION_LABELS[group.kind]}</Text>
            <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19 }}>
              {isGps
                ? (group.count ? `${group.count} cảnh báo lệch GPS (Chỉ quản trị thấy)` : 'Chưa phát hiện bất thường GPS trong 7 ngày qua')
                : (group.count ? `${group.count} công việc cần xử lý` : 'Không có công việc cần xử lý')}
            </Text>
          </View>
          {group.count > 0 && <StatusBadge status={isGps || group.kind === 'overdue' ? 'overdue' : 'pending'} label={String(group.count)} />}
          <ChevronRight size={20} color={theme.muted} />
        </Card>
      </Pressable>;
    }) : <StateView title="Chưa có nhóm công việc" message="Tài khoản hiện không có quyền nhận các nhóm thông báo này." />}
    {query.error && <Button secondary label="Tải lại công việc" onPress={() => { void query.refetch(); }} />}
    <Pressable accessibilityRole="button" accessibilityLabel="Mở sự kiện gần đây" onPress={() => router.push('/notification-activity')}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ flex: 1, gap: 6 }}>
        <Text style={{ color: theme.text, fontSize: 17, fontWeight: '600' }}>Sự kiện gần đây</Text>
        <Text style={{ color: theme.muted, lineHeight: 22 }}>Hợp đồng, thu tiền và điều chuyển trong 7 ngày qua</Text>
      </View><ChevronRight size={20} color={theme.muted} /></Card>
    </Pressable>
    <Card style={{ gap: 12 }}><Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>Thông báo trên điện thoại</Text>
      <Text style={{ color: theme.muted, lineHeight: 22 }}>{push.data?.enabled ? 'Đã bật cho phiên đăng nhập trên thiết bị này.' : 'Bật để nhận nhắc việc khi không mở Himoto.'} Nội dung trên màn hình khóa không chứa thông tin khách hàng.</Text>
      {!!error && <InlineError message={error} />}
      {!!notice && <Text accessibilityLiveRegion="polite" style={{ color: theme.muted, lineHeight: 22 }}>{notice}</Text>}
      {push.data?.enabled && nativePushConfigured && <Button secondary label="Gửi thông báo thử" loading={busy} onPress={() => void test()} />}
      {push.error ? <><InlineError message="Chưa kiểm tra được trạng thái thông báo." /><Button secondary label="Kiểm tra lại thông báo" onPress={() => { void push.refetch(); }} /></> : push.isPending ? <Text style={{ color: theme.muted }}>Đang kiểm tra…</Text> : !push.data?.configured ? <Text style={{ color: theme.muted, lineHeight: 22 }}>Hệ thống đang chuẩn bị thông báo đẩy. Anh/chị vẫn xem được công việc tại đây.</Text> : !nativePushConfigured ? <Text style={{ color: theme.muted, lineHeight: 22 }}>Cập nhật bản cài Himoto để bật thông báo đẩy.</Text> : <><Button label={push.data.enabled ? 'Tắt thông báo trên thiết bị' : 'Bật thông báo trên thiết bị'} secondary={push.data.enabled} loading={busy} onPress={() => { void toggle(); }} /><Button secondary label="Mở cài đặt thông báo" onPress={() => { void Linking.openSettings().catch(() => setError('Không mở được Cài đặt điện thoại.')); }} /></>}
    </Card>
  </ScrollView></SafeAreaView>;
}
