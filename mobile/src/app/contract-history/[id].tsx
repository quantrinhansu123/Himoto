import { useState } from 'react';
import { FlatList, Keyboard, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { MobileHistoryChange, MobileHistoryCashflow } from '../../../../shared/mobile-contract-history';
import { useSession } from '@/providers/session';
import { dateTime, money, useTheme } from '@/theme';
import { Button, Card, KeyValueRow, PaginationBar, SegmentedBar, SkeletonList, StateView, StatusBadge } from '@/components/ui';
import { FormField } from '@/components/form-fields';

export default function ContractHistoryScreen() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>(), { api, session } = useSession();
  if (!api || !session || !/^[1-9]\d{0,14}$/.test(id) || !session.user.permissions.includes('contracts.read')) return <StateView title="Không mở được lịch sử hợp đồng" />;
  return <ContractHistoryView key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${id}:${tab || ''}`} id={id} initialTab={tab === 'cashflow' ? 'cashflow' : 'changes'} />;
}
function ContractHistoryView({ id, initialTab = 'changes' }: { id: string; initialTab?: 'changes' | 'cashflow' }) {
  const { api, session } = useSession(), theme = useTheme(), [tab, setTab] = useState<'changes' | 'cashflow'>(initialTab), [search, setSearch] = useState(''), [filter, setFilter] = useState(''), [page, setPage] = useState(1);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['contract-history', api?.origin, session?.user.id, session?.user.storeId, session?.user.allStores, id, tab, filter, page], gcTime: 0, staleTime: 0, retry: false,
    enabled: !!api, queryFn: ({ signal }) => api!.contractHistory(id, new URLSearchParams({ tab, search: filter, page: String(page) }), signal)
  });
  const data = query.data, text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  const rows: { key: string; change?: MobileHistoryChange; cashflow?: MobileHistoryCashflow }[] = data ? tab === 'changes' ? data.changes.map(change => ({ key: change.id, change })) : data.cashflow.map(cashflow => ({ key: String(cashflow.id), cashflow })) : [];
  function applySearch() { Keyboard.dismiss(); setFilter(search.trim()); setPage(1); }
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
    <Stack.Screen options={{ title: 'Lịch sử và phiếu hợp đồng' }} />
    <FlatList data={rows} keyExtractor={r => r.key} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 760, width: '100%', alignSelf: 'center', paddingBottom: 36 }}
      refreshControl={<RefreshControl refreshing={query.isFetching && !query.isPending} onRefresh={() => void query.refetch()} tintColor={theme.primary} />}
      ListHeaderComponent={<View style={{ gap: 14, marginBottom: 4 }}>
        <Text accessibilityRole="header" style={{ ...text, fontSize: 20, fontWeight: '800' }}>{data?.code || `Hợp đồng #${id}`}</Text>
        {data && <Card style={{ gap: 6 }}>
          <View style={{ gap: 2 }}>
            <KeyValueRow label="Tổng đã thu / đã chi" value={`${money(data.receipts.received)} / ${money(data.receipts.spent)}`} emphasize />
            <KeyValueRow label="Thuê · Gia hạn · Thu khác" value={`${money(data.receipts.rental_received)} · ${money(data.receipts.renewal_received)} · ${money(data.receipts.other_received)}`} />
            <KeyValueRow label="Cọc thu · Đã hoàn · Còn giữ" value={`${money(data.receipts.deposit_received)} · ${money(data.receipts.deposit_refunded)} · ${money(data.receipts.deposit_held)}`} />
            <KeyValueRow label="Hoàn tiền thuê" value={money(data.receipts.rental_refunded)} />
            <KeyValueRow label="Thu ròng" value={money(data.receipts.net)} emphasize />
          </View>
          <Text style={muted}>Tổng toàn bộ phiếu đã duyệt của hợp đồng. Phiếu hủy/từ chối/chờ duyệt vẫn xem được, không cộng vào tổng này.</Text>
        </Card>}
        <SegmentedBar value={tab} items={[{ value: 'changes', label: 'Diễn biến', count: data?.changeCount }, { value: 'cashflow', label: 'Phiếu thu / chi', count: data?.cashflowCount }]} onChange={v => { setTab(v); setPage(1); }} />
        <FormField label="Tìm trong lịch sử hợp đồng" value={search} maxLength={120} onChangeText={setSearch} onSubmitEditing={applySearch} returnKeyType="search" />
        <View style={{ flexDirection: 'row', gap: 10 }}><Button size="sm" equalWidth secondary label="Tìm lịch sử" onPress={applySearch} />{!!filter && <Button size="sm" equalWidth secondary label="Xóa lọc lịch sử" onPress={() => { setSearch(''); setFilter(''); setPage(1); }} />}</View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {session?.user.permissions.includes('finance.write') && (
            <Button size="sm" equalWidth secondary label="Thu / Chi hợp đồng" onPress={() => router.push({ pathname: '/finance/[id]', params: { id } })} />
          )}
          <Button size="sm" equalWidth secondary label="Xem chi tiết HĐ" onPress={() => router.push({ pathname: '/record/[kind]/[id]', params: { kind: 'contracts', id } })} />
        </View>
        {query.isError && <StateView title="Chưa tải được lịch sử" message={(query.error as Error).message} retry={() => void query.refetch()} />}
        {query.isPending && <SkeletonList count={3} />}
        {data && <Text accessibilityLiveRegion="polite" style={muted}>{data.total} kết quả · Trang {data.page}/{data.pages}{data.search ? ` · “${data.search}”` : ''}</Text>}
      </View>}
      renderItem={({ item }) => <Card style={{ gap: 8 }}>{item.change ? <>
        <Text accessibilityRole="header" style={{ ...text, fontSize: 17, fontWeight: '700' }}>{item.change.title}</Text>
        <View style={{ gap: 2 }}>
          <KeyValueRow label="Thời điểm & người thực hiện" value={`${dateTime(item.change.at)} · ${item.change.actor}`} />
          {item.change.amount !== null && <KeyValueRow label="Giá trị" value={money(item.change.amount)} emphasize />}
          {!!item.change.detail && <KeyValueRow label="Chi tiết" value={item.change.detail} />}
        </View>
        {item.change.version && <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8 }}>
          <Button size="sm" secondary label={expandedVersion === item.change.id ? 'Thu gọn bản đối chiếu' : `Xem nhanh · ${item.change.version.label}`} onPress={() => setExpandedVersion(prev => prev === item.change!.id ? null : item.change!.id)} />
          {expandedVersion === item.change.id && (
            <View style={{ gap: 2, padding: 10, borderRadius: 9, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border }}>
              <Text style={{ color: theme.text, fontWeight: '700', marginBottom: 4 }}>{item.change.version.label}</Text>
              <KeyValueRow label="Hẹn trả" value={dateTime(item.change.version.return_at || '')} />
              <KeyValueRow label="Tổng giá trị" value={money(item.change.version.total)} />
              <KeyValueRow label="Đã thu" value={money(item.change.version.paid)} emphasize />
            </View>
          )}
        </View>}
        {(item.change.version || ['created', 'swap'].includes(item.change.kind)) && <Button size="sm" secondary label={`Xem giấy / in ${item.change.version?.label || item.change.title}`} onPress={() => router.push({ pathname: '/print/[kind]/[id]', params: { kind: 'contracts', id, version: item.change!.id } })} />}
      </> : item.cashflow ? <>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text accessibilityRole="header" style={{ ...text, fontSize: 17, fontWeight: '700', flex: 1 }}>Phiếu #{item.cashflow.id} · {item.cashflow.type === 'income' ? 'Thu' : 'Chi'} {money(item.cashflow.amount)}</Text>
          <StatusBadge status={item.cashflow.status_code} label={item.cashflow.status} />
        </View>
        <View style={{ gap: 2 }}>
          <KeyValueRow label="Lý do" value={item.cashflow.reason} />
          <KeyValueRow label="Thời điểm & người tạo" value={`${dateTime(item.cashflow.at)} · ${item.cashflow.actor}`} />
          <KeyValueRow label="Hình thức & tài khoản" value={`${item.cashflow.method} · ${item.cashflow.account}`} />
          {!!item.cashflow.note && <KeyValueRow label="Ghi chú" value={item.cashflow.note} />}
        </View>
        {item.cashflow.status_code !== 'approved' && <Text style={muted}>Phiếu này không cộng vào tổng tiền đã duyệt.</Text>}
      </> : null}</Card>}
      ListEmptyComponent={!query.isPending && !query.isError ? <StateView title="Không có lịch sử phù hợp" /> : undefined}
      ListFooterComponent={data && data.pages > 1 ? <PaginationBar page={data.page} pages={data.pages} total={data.total} unit="dòng lịch sử" loading={query.isFetching} onPrev={() => setPage(data.page - 1)} onNext={() => setPage(data.page + 1)} /> : undefined}
    />
  </SafeAreaView>;
}
