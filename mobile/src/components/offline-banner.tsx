import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react-native';
import { useOffline } from '@/hooks/use-offline';
import { useSession } from '@/providers/session';
import { dateTime, useTheme } from '@/theme';

export function OfflineBanner() {
  const theme = useTheme(), state = useOffline(), { session } = useSession();
  if (!session || (state.connected && !state.verifying && !state.pending && !state.cachedAt && !state.error)) return null;
  const Icon = state.conflicts || state.error ? TriangleAlert : state.connected ? RefreshCw : CloudOff;
  const title = !state.connected ? 'Đang ngoại tuyến' : state.conflicts ? `${state.conflicts} thao tác cần đối chiếu` : state.pending ? `${state.pending} thao tác chờ xác nhận` : state.error ? 'Lưu offline cần kiểm tra' : state.verifying ? 'Đang cập nhật dữ liệu' : 'Đang xem dữ liệu đã lưu';
  const subtitle = state.error || (state.cachedAt ? `Dữ liệu lưu lúc ${dateTime(new Date(state.cachedAt).toISOString())}` : state.syncing ? 'Đang đồng bộ với máy chủ' : 'Chạm để xem trạng thái đồng bộ');
  return <SafeAreaView edges={['top']} style={{ backgroundColor: theme.surface }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${subtitle}. Mở trạng thái đồng bộ`} onPress={() => router.navigate('/offline-sync')}
      style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 10, minHeight: 56, opacity: pressed ? 0.7 : 1, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderColor: theme.border })}>
      <Icon size={22} color={theme.warning} accessible={false}/>
      <View style={{ flex: 1, gap: 2 }} accessibilityLiveRegion="polite">
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{title}</Text>
        <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18 }}>{subtitle}</Text>
      </View>
    </Pressable>
  </SafeAreaView>;
}
