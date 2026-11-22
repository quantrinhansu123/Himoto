import { RefreshControl, ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nativePushConfigured } from '@/lib/push-notifications';
import { readSePaySound, setSePaySound } from '@/lib/sepay-notification-sound';
import { useSession } from '@/providers/session';
import { dateTime, money, useTheme } from '@/theme';
import { Button, Card, InlineError, StateView } from '@/components/ui';

export default function Route() {
  const { api, session } = useSession(), theme = useTheme();
  const allowed = !!api && !!session?.user.permissions.includes('contracts.read');
  const query = useQuery({
    queryKey: ['sepay-events', api?.origin, session?.user.id, session?.user.storeId, session?.user.allStores],
    queryFn: ({ signal }) => api!.sepayEvents(0, signal), retry: false, enabled: allowed,
  });
  if (!allowed) return <StateView title="Không có quyền xem tiền về qua SePay" />;
  return <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40, maxWidth: 760, width: '100%', alignSelf: 'center' }}
    refreshControl={<RefreshControl refreshing={query.isRefetching} tintColor={theme.primary} onRefresh={() => { void query.refetch(); }} />}>
    {nativePushConfigured && session && <SoundSetting key={session.user.id} userId={session.user.id} />}
    {query.isPending ? <StateView title="Đang tải giao dịch SePay" loading />
      : query.isError ? <StateView title="Chưa tải được giao dịch SePay" message={query.error.message} retry={() => { void query.refetch(); }} />
        : !query.data.length ? <StateView title="Chưa có giao dịch SePay đã đối chiếu" />
          : query.data.map(row => <Card key={row.id} style={{ gap: 10 }}>
            <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>HĐ {row.code} · {money(row.amount)}</Text>
            <Text style={{ color: theme.muted }}>{row.mode === 'test' ? 'Demo SePay' : 'Đã nhận tiền'} · {dateTime(row.received_at)}</Text>
            <Button secondary label={`Mở hợp đồng ${row.code}`} onPress={() => router.push({
              pathname: '/record/[kind]/[id]', params: { kind: 'contracts', id: String(row.order_id) },
            })} />
          </Card>)}
  </ScrollView>;
}

function SoundSetting({ userId }: { userId: number }) {
  const cache = useQueryClient(), key = ['sepay-sound', userId];
  const sound = useQuery({ queryKey: key, queryFn: () => readSePaySound(userId), retry: false });
  const setSound = useMutation({ mutationFn: (enabled: boolean) => setSePaySound(userId, enabled),
    onSuccess: (_, enabled) => { cache.setQueryData(key, enabled); } });
  return <Card style={{ gap: 8 }}>
    <Button secondary label={sound.data ? 'Tắt âm báo SePay' : 'Bật âm báo SePay'} disabled={sound.isPending}
      loading={setSound.isPending} onPress={() => setSound.mutate(!sound.data)} />
    {!!setSound.error && <InlineError message={setSound.error.message} />}
  </Card>;
}
