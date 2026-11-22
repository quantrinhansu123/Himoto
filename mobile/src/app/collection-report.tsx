import { useMemo, useRef, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Phone, Search, Send, SlidersHorizontal, X } from 'lucide-react-native';
import { CONTACT_STATUSES, HANDLING_STATUSES, filterCollectionRows } from '../../../shared/collection-report';
import { GPS_STATE_LABELS } from '../../../shared/gps';
import { Button, Card, Chip, InfoBanner, InlineError, KeyValueRow, SkeletonList, StateView, StatusBadge } from '@/components/ui';
import { ChoiceField } from '@/components/form-fields';
import { EditorSheet } from '@/components/editor-sheet';
import { FileExportButton } from '@/components/file-export-button';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useScreenActive } from '@/hooks/use-screen-active';
import { useWorkspace } from '@/hooks/use-workspace';
import { useSession } from '@/providers/session';
import { dateTime, money, useTheme } from '@/theme';

function CollectionReport() {
  const { api, session } = useSession(), theme = useTheme(), workspace = useWorkspace(), active = useScreenActive();
  const user = session!.user, all = user.allStores || user.allStoresRead;
  const [store, setStore] = useState(all ? 'all' : String(user.storeId ?? ''));
  const [search, setSearch] = useState(''), term = useDebouncedValue(search), [handling, setHandling] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [preview, setPreview] = useState<{ store: string; hash: string; messages: string[] }>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const sending = useRef(false);
  const query = useQuery({
    queryKey: ['collection-report', api!.origin, user.id, user.storeId, user.allStores, user.allStoresRead, store],
    queryFn: ({ signal }) => api!.collectionReport(store, signal), enabled: !!store && active, retry: false,
    refetchInterval: q => active && q.state.data?.deliveries.some(row => row.status === 'pending' || row.status === 'sending') ? 5000 : false,
  });
  const data = query.data;
  const rows = useMemo(() => filterCollectionRows(data?.rows ?? [], term, handling), [data, term, handling]);
  const canSend = store !== 'all' && (user.allStores || String(user.storeId) === store) && user.permissions.includes('contracts.draft');
  const filters = new URLSearchParams({ store, search: term, handling });
  const text = { color: theme.text, lineHeight: 23 };

  async function send() {
    if (!preview || sending.current || !canSend || preview.store !== store) return;
    sending.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api!.sendCollectionReport(Number(store), preview.hash);
      setNotice(`Đã xếp ${result.queued} tin báo cáo vào hàng đợi Telegram của PGD.`);
      setPreview(undefined);
      void query.refetch();
    } catch (cause) {
      setError((cause as Error).message);
      void query.refetch();
    } finally { sending.current = false; setBusy(false); }
  }

  function call(phone: string) {
    const number = phone.replace(/[^\d+]/g, '');
    if (/^\+?\d{8,15}$/.test(number)) {
      void Linking.openURL(`tel:${number}`).catch(() => setError('Chưa mở được chức năng gọi điện.'));
    }
  }

  return <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background }}>
    <FlatList data={rows} keyExtractor={row => String(row.id)} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 11, maxWidth: 760, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }} tintColor={theme.primary} />}
      ListHeaderComponent={<View style={{ gap: 11 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Báo cáo nợ chậm</Text>
            <Text style={{ color: theme.muted, fontSize: 12.5 }}>
              {data ? `${rows.length} hợp đồng · Đọc lúc ${dateTime(data.read_at)}` : 'Theo dõi quá hạn và cập nhật xử lý theo PGD'}
            </Text>
          </View>
          {user.permissions.includes('contracts.draft') && (
            <Button size="sm" icon={<Send size={13} color={theme.primaryText} />} label="Gửi Telegram" disabled={!canSend || !data || query.isFetching || query.isError || busy} onPress={() => { if (data) { setError(''); setPreview({ store, hash: data.hash, messages: data.messages }); } }} />
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, borderColor: theme.controlBorder, backgroundColor: theme.surface, paddingHorizontal: 11, minHeight: 44 }}>
            <Search size={18} color={theme.muted} accessible={false} />
            <TextInput
              accessibilityLabel="Tìm khách, xe hoặc mã hợp đồng"
              placeholder="Tìm khách, biển số, mã HĐ…"
              placeholderTextColor={theme.muted}
              value={search}
              maxLength={300}
              onChangeText={setSearch}
              autoCorrect={false}
              style={{ flex: 1, color: theme.text, fontSize: 14.5, paddingVertical: 8 }}
            />
            {!!search && <Pressable onPress={() => setSearch('')} hitSlop={8}><X size={17} color={theme.muted} /></Pressable>}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Chọn PGD và xuất Excel" onPress={() => setFiltersOpen(v => !v)} style={{ minWidth: 44, minHeight: 44, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: filtersOpen || store !== 'all' ? theme.primary : theme.controlBorder, backgroundColor: filtersOpen || store !== 'all' ? theme.tint : theme.surface, alignItems: 'center', justifyContent: 'center' }}>
            <SlidersHorizontal size={18} color={filtersOpen || store !== 'all' ? theme.primary : theme.text} />
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
          <Chip label="Tất cả" selected={handling === ''} onPress={() => setHandling('')} />
          {Object.entries(HANDLING_STATUSES).map(([value, label]) => (
            <Chip key={value} label={label} selected={handling === value} onPress={() => setHandling(value)} />
          ))}
        </ScrollView>
        {filtersOpen && (
          <Card style={{ gap: 10 }}>
            <ChoiceField label="PGD báo cáo nợ chậm" value={store} choices={[
              ...(all ? [{ value: 'all', label: 'Tất cả cơ sở' }] : []),
              ...(workspace.data?.stores ?? []).filter(row => all || row.id === user.storeId).map(row => ({ value: String(row.id), label: row.name })),
            ]} disabled={!all || busy || !!preview} onChange={value => { setStore(value); setError(''); setNotice(''); }} searchable />
            <FileExportButton key={filters.toString()} disabled={!rows.length || query.isFetching || query.isError || search.trim() !== term} load={signal => api!.collectionReportExcel(filters, signal)} />
          </Card>
        )}
        {store === 'all' && user.permissions.includes('contracts.draft') && <Text style={{ color: theme.muted, fontSize: 12 }}>Mở bộ lọc chọn một PGD cụ thể để gửi báo cáo Telegram nhóm PGD.</Text>}
        {data?.deliveries.length ? <InfoBanner tone="info" message={`Telegram · ${data.deliveries.filter(row => row.status === 'sent').length}/${data.messages.length} tin đã gửi.${data.deliveries.some(row => row.status === 'unknown') ? ' Có tin chưa rõ kết quả.' : ''}${data.deliveries.some(row => row.status === 'awaiting_config') ? ' PGD chưa cấu hình Telegram.' : ''}${data.deliveries.some(row => row.status === 'failed') ? ' Có tin thất bại.' : ''}${data.deliveries.some(row => row.status === 'pending' || row.status === 'sending') ? ' Đang chờ gửi.' : ''}`} /> : null}
        {!!notice && <InfoBanner tone="success" message={notice} />}
        {!preview && !!error && <InlineError message={error} />}
      </View>}
      ListEmptyComponent={!store ? <StateView title="Tài khoản chưa được gán PGD" />
        : query.isPending ? <SkeletonList count={4} lines={3} />
        : query.isError ? <StateView title="Chưa tải được báo cáo nợ chậm" message={query.error.message} retry={() => { void query.refetch(); }} />
          : <StateView title="Không có hợp đồng nợ chậm phù hợp" />}
      renderItem={({ item }) => <Card style={{ gap: 8, padding: 13 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <Text style={{ color: theme.primary, fontSize: 13.5, fontWeight: '800' }}>{item.code}</Text>
            <Text numberOfLines={1} style={{ color: theme.text, fontSize: 15.5, fontWeight: '700', flexShrink: 1 }}>{item.customer}</Text>
          </View>
          <StatusBadge status="overdue" label={`Trễ ${item.days} ngày`} />
        </View>
        <View style={{ gap: 2 }}>
          <KeyValueRow label="Nợ đến hạn" strong valueColor={theme.danger} value={money(item.amount)} />
          {item.late_fee !== null && <KeyValueRow label="Phí trễ tạm tính" value={money(item.late_fee)} />}
          <KeyValueRow label="Biển số / PGD" value={`${item.vehicle || 'Chưa có BS'} · ${item.store_name}`} />
          <KeyValueRow label="Hạn trả / GPS" value={`${dateTime(item.due_at)} · ${item.gps.map(state => GPS_STATE_LABELS[state] ?? state).join(', ') || '—'}`} />
          <KeyValueRow label="Xử lý" value={`${CONTACT_STATUSES[item.followup.contact_status]} · ${HANDLING_STATUSES[item.followup.handling_status]}`} />
          {!!(item.followup.customer_condition || item.customer_status) && <KeyValueRow label="Tình trạng" value={item.followup.customer_condition || item.customer_status} />}
        </View>
        {!!item.followup.notes && <Text style={{ color: theme.muted, fontSize: 12.5, lineHeight: 18 }} numberOfLines={3}>{item.followup.notes}</Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 2 }}>
          <Button size="sm" equalWidth label="Cập nhật xử lý" onPress={() => router.push({ pathname: '/collection-followup/[id]', params: { id: String(item.id) } })} />
          <Button size="sm" equalWidth secondary label="Mở HĐ" onPress={() => router.push({ pathname: '/record/[kind]/[id]', params: { kind: 'contracts', id: String(item.id) } })} />
          {!!item.phone && <Button size="sm" secondary icon={<Phone size={13} color={theme.text} />} label="Gọi" onPress={() => call(item.phone)} />}
        </View>
      </Card>} />
    {preview && <EditorSheet title="Báo cáo gửi nhóm Telegram PGD" onClose={() => { if (!busy) setPreview(undefined); }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
        {preview.messages.map((message, index) => <Card key={index}><Text style={text} selectable>{message}</Text></Card>)}
        {!!error && <InlineError message={error} />}
        <Button label={`Gửi ${preview.messages.length} tin báo cáo`} loading={busy}
          disabled={query.isFetching || data?.hash !== preview.hash}
          onPress={() => { void send(); }} />
        {data && data.hash !== preview.hash && <Button secondary label="Xem nội dung báo cáo mới"
          disabled={busy} onPress={() => { setError(''); setPreview({ store, hash: data.hash, messages: data.messages }); }} />}
      </ScrollView>
    </EditorSheet>}
  </SafeAreaView>;
}

export default function Route() {
  const { api, session } = useSession();
  if (!api || !session?.user.permissions.includes('contracts.read')) return <StateView title="Không có quyền xem báo cáo nợ chậm" />;
  return <CollectionReport key={`${api.origin}:${session.user.id}:${session.user.storeId}:${session.user.allStores}:${session.user.allStoresRead}`} />;
}
