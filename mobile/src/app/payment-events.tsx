import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Volume2, VolumeX } from 'lucide-react-native';
import { readSePaySound, setSePaySound } from '@/lib/sepay-notification-sound';
import { useSession } from '@/providers/session';
import { dateTime, money, useTheme } from '@/theme';
import { Button, Card, InlineError, KeyValueRow, SkeletonList, StateView, StatusBadge } from '@/components/ui';

export default function Route() {
  const { api, session } = useSession(), theme = useTheme();
  const allowed = !!api && !!session?.user.permissions.some(p => p === 'contracts.read' || p === 'finance.read');
  const query = useQuery({
    queryKey: ['sepay-events', api?.origin, session?.user.id, session?.user.storeId, session?.user.allStores],
    queryFn: ({ signal }) => api!.sepayEvents(0, signal), retry: false, enabled: allowed,
  });
  if (!allowed) return <StateView title="Không có quyền xem tiền về qua SePay" />;
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 11, paddingBottom: 36, maxWidth: 760, width: '100%', alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={query.isRefetching} tintColor={theme.primary} onRefresh={() => { void query.refetch(); }} />}
      >
        <View style={{ gap: 2 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Tiền về SePay</Text>
          <Text style={{ color: theme.muted, fontSize: 12.5 }}>Biến động giao dịch chuyển khoản tự động đối chiếu hợp đồng</Text>
        </View>
        {session && <SoundSetting key={session.user.id} userId={session.user.id} />}
        {query.isPending ? (
          <SkeletonList count={4} lines={2} />
        ) : query.isError ? (
          <StateView title="Chưa tải được giao dịch SePay" message={query.error.message} retry={() => { void query.refetch(); }} />
        ) : !query.data.length ? (
          <StateView title="Chưa có giao dịch SePay đã đối chiếu" />
        ) : (
          query.data.map(row => (
            <Card key={row.id} style={{ gap: 8, padding: 13 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: theme.primary, fontSize: 15, fontWeight: '800' }}>HĐ {row.code}</Text>
                <StatusBadge status={row.mode === 'test' ? 'pending' : 'income'} label={row.mode === 'test' ? 'Demo SePay' : 'Đã nhận tiền'} />
              </View>
              <View style={{ gap: 2 }}>
                <KeyValueRow label="Số tiền nhận" strong valueColor={theme.success} value={`+${money(row.amount)}`} />
                <KeyValueRow label="Thời điểm nhận" value={dateTime(row.received_at)} />
              </View>
              <Button size="sm" secondary label={`Mở hợp đồng ${row.code}`} onPress={() => router.push({ pathname: '/record/[kind]/[id]', params: { kind: 'contracts', id: String(row.order_id) } })} />
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SoundSetting({ userId }: { userId: number }) {
  const theme = useTheme();
  const cache = useQueryClient(), key = ['sepay-sound', userId];
  const sound = useQuery({ queryKey: key, queryFn: () => readSePaySound(userId), retry: false });
  const setSound = useMutation({
    mutationFn: (enabled: boolean) => setSePaySound(userId, enabled),
    onSuccess: (_, enabled) => { cache.setQueryData(key, enabled); },
  });
  return (
    <Card style={{ gap: 8, padding: 13 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: theme.text, fontSize: 14.5, fontWeight: '700' }}>Âm báo tiền về SePay</Text>
          <Text style={{ color: theme.muted, fontSize: 12.5 }}>{sound.data ? 'Đang bật âm thông báo khi có tiền vào' : 'Đang tắt âm báo trên máy này'}</Text>
        </View>
        <Button
          size="sm"
          secondary
          icon={sound.data ? <VolumeX size={14} color={theme.text} /> : <Volume2 size={14} color={theme.text} />}
          label={sound.data ? 'Tắt âm' : 'Bật âm'}
          disabled={sound.isPending}
          loading={setSound.isPending}
          onPress={() => setSound.mutate(!sound.data)}
        />
      </View>
      {!!setSound.error && <InlineError message={setSound.error.message} />}
    </Card>
  );
}
