import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CloudCheck, CloudOff, RefreshCw } from 'lucide-react-native';
import { Button, Card, InlineError } from '@/components/ui';
import { useOffline } from '@/hooks/use-offline';
import { useSession } from '@/providers/session';
import { openOfflineStore } from '@/lib/offline-native';
import { offlineOperationLabel } from '@/lib/offline-policy';
import { syncOffline } from '@/lib/offline-sync';
import { dateTime, useTheme } from '@/theme';

export default function OfflineSyncScreen() {
  const theme = useTheme(), state = useOffline(), { api, restore } = useSession();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function sync() {
    if (!api || busy) return;
    setBusy(true); setError('');
    try {
      const store = await openOfflineStore();
      await store.retryNow(state.scope);
      if (!await syncOffline(api.origin)) setError('Chưa đồng bộ xong. Các thao tác vẫn được giữ trên máy; kiểm tra mạng hoặc đối chiếu mục cần xử lý.');
      await restore();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  const Icon = state.connected ? CloudCheck : CloudOff;
  return <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 20, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
    <Card style={{ gap: 12 }}>
      <Icon size={32} color={state.connected ? theme.success : theme.warning} accessible={false}/>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 24, fontWeight: '800' }}>{state.connected ? 'Kết nối và đồng bộ' : 'Đang làm việc offline'}</Text>
      <Text style={{ color: theme.muted, fontSize: 15, lineHeight: 24 }}>Có thể tra cứu hồ sơ đã tải và tiếp tục bản đang soạn. Dữ liệu tra cứu được giữ tối đa 24 giờ sau lần tải.</Text>
      <Text style={{ color: theme.text, fontSize: 15, lineHeight: 24 }}>Thao tác chờ chỉ hoàn tất khi máy chủ xác nhận. Máy chủ sẽ kiểm tra lại tiền, tồn xe, phiên bản hồ sơ và quyền truy cập.</Text>
      <View accessibilityLiveRegion="polite"><Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>{state.pending} chờ xác nhận · {state.conflicts} cần đối chiếu</Text></View>
      <Button label="Đồng bộ ngay" loading={busy || state.syncing} onPress={() => { void sync(); }}/>
      <Button secondary label="Mở bản đang soạn và đối chiếu giao dịch" onPress={() => router.dismissTo('/(tabs)/account')}/>
    </Card>
    {!!(error || state.error) && <InlineError message={error || state.error}/>}
    {state.rows.length === 0 && <Card><Text style={{ color: theme.muted, fontSize: 15, lineHeight: 24 }}>Không có thao tác trong hàng đợi của phiên làm việc này.</Text></Card>}
    {state.rows.map(row => <Card key={row.key} style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <RefreshCw size={20} color={row.state === 'conflict' ? theme.warning : row.state === 'committed' ? theme.success : theme.muted} accessible={false}/>
        <Text style={{ flex: 1, color: theme.text, fontSize: 17, fontWeight: '700' }}>{offlineOperationLabel(row.operation)}</Text>
      </View>
      <Text style={{ color: row.state === 'conflict' ? theme.warning : theme.text, fontSize: 15, fontWeight: '600' }}>{row.state === 'committed' ? 'Máy chủ đã xác nhận' : row.state === 'conflict' ? 'Cần đối chiếu — đã dừng gửi tự động' : row.state === 'sending' ? 'Đang gửi hoặc chờ kiểm tra lại' : 'Đã lưu trên máy · Chờ đồng bộ'}</Text>
      <Text style={{ color: theme.muted, fontSize: 13 }}>Lưu lúc {dateTime(new Date(row.created_at).toISOString())}</Text>
      <Text selectable style={{ color: theme.muted, fontSize: 12 }}>Mã đối chiếu: {row.key}</Text>
      {!!row.error && <Text style={{ color: theme.danger, fontSize: 14, lineHeight: 22 }}>{row.error}</Text>}
      {row.scope !== state.scope && <Text style={{ color: theme.warning, fontSize: 14, lineHeight: 22 }}>Thao tác được tạo với cơ sở hoặc quyền truy cập khác. Cần đối chiếu mã gốc trước khi tiếp tục.</Text>}
      {row.state === 'conflict' && <Button secondary label="Đối chiếu mã gốc trong Tài khoản" onPress={() => router.dismissTo('/(tabs)/account')}/>}
      {row.state === 'committed' && <Button secondary label="Ẩn thông báo đã đồng bộ" onPress={() => { void openOfflineStore().then(store => store.remove(row.scope, row.key)).catch(cause => setError((cause as Error).message)); }}/>}
    </Card>)}
    <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 21 }}>App tự đồng bộ khi có mạng và khi mở lại. Đồng bộ nền do hệ điều hành sắp lịch, có thể chậm khi tiết kiệm pin hoặc buộc dừng ứng dụng. Ảnh đang soạn được giữ trên máy; mở bản gốc để hoàn tất hồ sơ ảnh.</Text>
  </ScrollView>;
}
