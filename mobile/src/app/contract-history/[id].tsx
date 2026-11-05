import { useState } from 'react';
import { FlatList, Keyboard, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { MobileHistoryChange, MobileHistoryCashflow } from '../../../../shared/mobile-contract-history';
import { useSession } from '@/providers/session';
import { dateTime, money, useTheme } from '@/theme';
import { Button, Card, StateView } from '@/components/ui';
import { ChoiceField, FormField } from '@/components/form-fields';

export default function ContractHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(), { api, session } = useSession();
  if (!api || !session || !/^[1-9]\d{0,14}$/.test(id) || !session.user.permissions.includes('contracts.read')) return <StateView title="Không mở được lịch sử hợp đồng" />;
  return <ContractHistoryView key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${id}`} id={id} />;
}
function ContractHistoryView({ id }: { id: string }) {
  const { api, session } = useSession(), theme = useTheme(), [tab, setTab] = useState<'changes' | 'cashflow'>('changes'), [search, setSearch] = useState(''), [filter, setFilter] = useState(''), [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['contract-history', api?.origin, session?.user.id, session?.user.storeId, session?.user.allStores, id, tab, filter, page], gcTime: 0, staleTime: 0, retry: false,
    enabled: !!api, queryFn: ({ signal }) => api!.contractHistory(id, new URLSearchParams({ tab, search: filter, page: String(page) }), signal) });
  const data = query.data, text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  const rows: { key: string; change?: MobileHistoryChange; cashflow?: MobileHistoryCashflow }[] = data ? tab === 'changes' ? data.changes.map(change => ({ key: change.id, change })) : data.cashflow.map(cashflow => ({ key: String(cashflow.id), cashflow })) : [];
  function applySearch() { Keyboard.dismiss(); setFilter(search.trim()); setPage(1); }
  return <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
    <Stack.Screen options={{ title: 'Lịch sử và phiếu hợp đồng' }} />
    <FlatList data={rows} keyExtractor={r => r.key} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={query.isFetching && !query.isPending} onRefresh={() => void query.refetch()} tintColor={theme.primary} />}
      ListHeaderComponent={<View style={{ gap: 16, marginBottom: 8 }}>
        <Text accessibilityRole="header" style={{ ...text, fontSize: 22, fontWeight: '700' }}>{data?.code || `Hợp đồng #${id}`}</Text>
        {data && <Card style={{ gap: 8 }}><Text style={text}>Tổng đã thu: {money(data.receipts.received)} · Đã chi: {money(data.receipts.spent)}</Text><Text style={text}>Thuê: {money(data.receipts.rental_received)} · Gia hạn: {money(data.receipts.renewal_received)} · Thu khác: {money(data.receipts.other_received)}</Text><Text style={text}>Cọc thu: {money(data.receipts.deposit_received)} · Đã hoàn: {money(data.receipts.deposit_refunded)} · Còn giữ: {money(data.receipts.deposit_held)}</Text><Text style={text}>Hoàn tiền thuê: {money(data.receipts.rental_refunded)} · Thu ròng: {money(data.receipts.net)}</Text><Text style={muted}>Tổng toàn bộ phiếu đã duyệt của hợp đồng. Phiếu hủy/từ chối/chờ duyệt vẫn xem được, không cộng vào tổng này.</Text></Card>}
        <ChoiceField label="Nội dung lịch sử" value={tab} choices={[{ value: 'changes', label: `Diễn biến${data ? ` (${data.changeCount})` : ''}` }, { value: 'cashflow', label: `Phiếu thu / chi${data ? ` (${data.cashflowCount})` : ''}` }]} onChange={v => { setTab(v as typeof tab); setPage(1); }} />
        <FormField label="Tìm trong lịch sử hợp đồng" value={search} maxLength={120} onChangeText={setSearch} onSubmitEditing={applySearch} returnKeyType="search" />
        <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Button secondary label="Tìm lịch sử" onPress={applySearch} /></View>{!!filter && <View style={{ flex: 1 }}><Button secondary label="Xóa lọc lịch sử" onPress={() => { setSearch(''); setFilter(''); setPage(1); }} /></View>}</View>
        {query.isError && <StateView title="Chưa tải được lịch sử" message={(query.error as Error).message} retry={() => void query.refetch()} />}
        {query.isPending && <StateView title="Đang tải lịch sử hợp đồng" loading />}
        {data && <Text accessibilityLiveRegion="polite" style={muted}>{data.total} kết quả · Trang {data.page}/{data.pages}{data.search ? ` · “${data.search}”` : ''}</Text>}
      </View>}
      renderItem={({ item }) => <Card style={{ gap: 8 }}>{item.change ? <>
        <Text accessibilityRole="header" style={{ ...text, fontSize: 18, fontWeight: '700' }}>{item.change.title}</Text><Text style={muted}>{dateTime(item.change.at)} · {item.change.actor}</Text>
        {!!item.change.detail && <Text selectable style={text}>{item.change.detail}</Text>}{item.change.amount !== null && <Text style={text}>Giá trị: {money(item.change.amount)}</Text>}
        {item.change.version && <View style={{ gap: 5, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8 }}><Text style={muted}>{item.change.version.label}</Text><Text style={text}>Hẹn trả: {dateTime(item.change.version.return_at || '')} · Tổng: {money(item.change.version.total)} · Đã thu: {money(item.change.version.paid)}</Text></View>}
        {(item.change.version || ['created', 'swap'].includes(item.change.kind)) && <Button secondary label={`Xem giấy / in ${item.change.version?.label || item.change.title}`} onPress={() => router.push({ pathname: '/print/[kind]/[id]', params: { kind: 'contracts', id, version: item.change!.id } })} />}
      </> : item.cashflow ? <>
        <Text accessibilityRole="header" style={{ ...text, fontSize: 18, fontWeight: '700' }}>Phiếu #{item.cashflow.id} · {item.cashflow.type === 'income' ? 'Thu' : 'Chi'} {money(item.cashflow.amount)}</Text>
        <Text style={text}>{item.cashflow.status} · {item.cashflow.reason}</Text><Text style={muted}>{dateTime(item.cashflow.at)} · {item.cashflow.actor}</Text>
        <Text selectable style={text}>{item.cashflow.method} · {item.cashflow.account}</Text>{!!item.cashflow.note && <Text selectable style={text}>{item.cashflow.note}</Text>}
        {item.cashflow.status_code !== 'approved' && <Text style={muted}>Phiếu này không cộng vào tổng tiền đã duyệt.</Text>}
      </> : null}</Card>}
      ListEmptyComponent={!query.isPending && !query.isError ? <StateView title="Không có lịch sử phù hợp" /> : undefined}
      ListFooterComponent={data && data.pages > 1 ? <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}><View style={{ flex: 1 }}><Button secondary label="Trang lịch sử trước" disabled={query.isFetching || data.page <= 1} onPress={() => setPage(data.page - 1)} /></View><View style={{ flex: 1 }}><Button secondary label="Trang lịch sử sau" disabled={query.isFetching || data.page >= data.pages} onPress={() => setPage(data.page + 1)} /></View></View> : undefined}
    />
  </SafeAreaView>;
}
