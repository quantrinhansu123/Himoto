import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Send } from 'lucide-react-native';
import { CONTRACT_EVENT_LABELS, NOTICE_STATUS_LABELS, type ContractEventType } from '../../../shared/contract-telegram';
import { useSession } from '@/providers/session';
import { useWorkspace } from '@/hooks/use-workspace';
import { dateTime, useTheme } from '@/theme';
import { Button, Card, KeyValueRow, PaginationBar, SkeletonList, StateView, StatusBadge } from '@/components/ui';
import { ChoiceField } from '@/components/form-fields';

function Pending() {
  const { api, session } = useSession(), theme = useTheme(), workspace = useWorkspace();
  const [store, setStore] = useState(session!.user.allStores ? 'all' : String(session!.user.storeId || 'all'));
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['telegram', 'pending', api!.origin, session!.user.id, session!.user.storeId, session!.user.allStores, store, page],
    queryFn: ({ signal }) => api!.pendingTelegram(new URLSearchParams({ store, page: String(page) }).toString(), signal),
    retry: false,
  });

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 11, maxWidth: 760, width: '100%', alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={query.isRefetching} tintColor={theme.primary} onRefresh={() => { void query.refetch(); }} />}
      >
        <View style={{ gap: 2 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Chưa gửi Telegram</Text>
          <Text style={{ color: theme.muted, fontSize: 12.5, lineHeight: 18 }}>
            Giao dịch chờ gửi, thiếu cấu hình, lỗi hoặc đã thu hồi. Mở từng mục để kiểm tra và gửi.
          </Text>
        </View>
        <ChoiceField label="Cơ sở" value={store} choices={[...(session!.user.allStores ? [{ value: 'all', label: 'Tất cả cơ sở' }] : []), ...(workspace.data?.stores || []).filter(s => session!.user.allStores || s.id === session!.user.storeId).map(s => ({ value: String(s.id), label: s.name }))]} searchable onChange={v => { setStore(v); setPage(1); }} />
        {query.isPending ? (
          <SkeletonList count={4} lines={3} />
        ) : query.isError ? (
          <StateView title="Chưa đọc được giao dịch chưa gửi" message={query.error.message} retry={() => void query.refetch()} />
        ) : (
          <>
            <Text style={{ color: theme.muted, fontSize: 12.5 }}>{query.data.total} giao dịch cần xử lý</Text>
            {query.data.rows.map(row => (
              <Card key={`${row.order_id}:${row.event_key}`} style={{ gap: 8, padding: 13 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <Text style={{ color: theme.primary, fontSize: 13.5, fontWeight: '800' }}>{row.code}</Text>
                    <Text numberOfLines={1} style={{ color: theme.text, fontSize: 15.5, fontWeight: '700', flexShrink: 1 }}>{row.customer_name}</Text>
                  </View>
                  <StatusBadge status={row.status === 'failed' ? 'failed' : 'pending'} label={NOTICE_STATUS_LABELS[row.status] || row.status} />
                </View>
                <View style={{ gap: 2 }}>
                  <KeyValueRow label="Loại giao dịch" value={CONTRACT_EVENT_LABELS[row.event_type as ContractEventType] || row.event_type} />
                  <KeyValueRow label="Cơ sở / Thời điểm" value={`${row.store_name} · ${dateTime(row.created_at)}`} />
                  {!!row.error_code && <KeyValueRow label="Mã lỗi" valueColor={theme.danger} value={row.error_code} />}
                </View>
                <Button size="sm" secondary icon={<Send size={13} color={theme.text} />} label="Kiểm tra & Gửi Telegram" onPress={() => router.push({ pathname: '/contract-telegram/[id]', params: { id: String(row.order_id), event: row.event_key } })} />
              </Card>
            ))}
            {!query.data.rows.length && <StateView title="Không có giao dịch chờ gửi" message="Mọi giao dịch trong bộ lọc này đều đã hoàn tất." />}
            <PaginationBar page={query.data.page} pages={query.data.pages} total={query.data.total} unit="giao dịch" disabled={query.isFetching} onChange={setPage} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function Screen() {
  const { api, session } = useSession();
  if (!api || !session || !session.user.permissions.includes('contracts.read')) return <StateView title="Không có quyền xem giao dịch Telegram" />;
  return <Pending key={[api.origin, session.token, session.user.storeId, session.user.allStores].join('|')} />;
}
