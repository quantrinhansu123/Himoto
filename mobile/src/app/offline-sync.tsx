import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CloudCheck, CloudOff, RefreshCw } from 'lucide-react-native';
import { Button, Card, InlineError, KeyValueRow, StatusBadge } from '@/components/ui';
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
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background }}><ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 14, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
    <Card style={{ gap: 10, padding: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <Icon size={22} color={state.connected ? theme.success : theme.warning} accessible={false}/>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: '800', flex: 1 }}>{state.connected ? 'Kết nối và đồng bộ' : 'Đang làm việc offline'}</Text>
        </View>
        <StatusBadge status={state.connected ? 'active' : 'warning'} label={state.connected ? 'Trực tuyến' : 'Offline'} />
      </View>
      <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19 }}>Có thể tra cứu hồ sơ đã tải và tiếp tục bản đang soạn. Dữ liệu tra cứu giữ tối đa 24 giờ.</Text>
      <KeyValueRow label="Hàng đợi đồng bộ" value={`${state.pending} chờ xác nhận · ${state.conflicts} cần đối chiếu`} emphasize />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button size="sm" equalWidth label="Đồng bộ ngay" loading={busy || state.syncing} onPress={() => { void sync(); }}/>
        <Button size="sm" equalWidth secondary label="Đối chiếu giao dịch" onPress={() => router.dismissTo('/(tabs)/account')}/>
      </View>
    </Card>
    {!!(error || state.error) && <InlineError message={error || state.error}/>}
    {state.rows.length === 0 && <Card><Text style={{ color: theme.muted, fontSize: 14, lineHeight: 21 }}>Không có thao tác trong hàng đợi của phiên làm việc này.</Text></Card>}
    {state.rows.map(row => <Card key={row.key} style={{ gap: 6, padding: 14 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flex: 1 }}>
          <RefreshCw size={17} color={row.state === 'conflict' ? theme.warning : row.state === 'committed' ? theme.success : theme.muted} accessible={false}/>
          <Text style={{ flex: 1, color: theme.text, fontSize: 15.5, fontWeight: '800' }}>{offlineOperationLabel(row.operation)}</Text>
        </View>
        <StatusBadge status={row.state === 'committed' ? 'completed' : row.state === 'conflict' ? 'warning' : 'pending'} label={row.state === 'committed' ? 'Đã xác nhận' : row.state === 'conflict' ? 'Cần đối chiếu' : 'Chờ đồng bộ'} />
      </View>
      <KeyValueRow label="Lưu lúc" value={dateTime(new Date(row.created_at).toISOString())} />
      <KeyValueRow label="Mã đối chiếu" value={row.key} selectable />
      {!!row.error && <InlineError message={row.error} />}
      {row.scope !== state.scope && <Text style={{ color: theme.warning, fontSize: 13, lineHeight: 19 }}>Thao tác được tạo với cơ sở hoặc quyền truy cập khác. Cần đối chiếu mã gốc trước khi tiếp tục.</Text>}
      {row.state === 'conflict' && <Button size="sm" secondary label="Đối chiếu mã gốc trong Tài khoản" onPress={() => router.dismissTo('/(tabs)/account')}/>}
      {row.state === 'committed' && <Button size="sm" secondary label="Ẩn thông báo đã đồng bộ" onPress={() => { void openOfflineStore().then(store => store.remove(row.scope, row.key)).catch(cause => setError((cause as Error).message)); }}/>}
    </Card>)}
    <Text style={{ color: theme.muted, fontSize: 12.5, lineHeight: 19 }}>App tự đồng bộ khi có mạng và khi mở lại. Ảnh đang soạn được giữ trên máy; mở bản gốc để hoàn tất hồ sơ ảnh.</Text>
  </ScrollView></SafeAreaView>;
}
