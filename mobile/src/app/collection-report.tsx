import { useMemo, useRef, useState } from 'react';
import { FlatList, Linking, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { CONTACT_STATUSES, HANDLING_STATUSES, filterCollectionRows } from '../../../shared/collection-report';
import { GPS_STATE_LABELS } from '../../../shared/gps';
import { Button, Card, InlineError, StateView } from '@/components/ui';
import { ChoiceField, FormField } from '@/components/form-fields';
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
  const muted = { color: theme.muted, lineHeight: 22 };

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

  return <>
    <FlatList data={rows} keyExtractor={row => String(row.id)} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 14, maxWidth: 760, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }} tintColor={theme.primary} />}
      ListHeaderComponent={<View style={{ gap: 14 }}>
        <ChoiceField label="PGD báo cáo nợ chậm" value={store} choices={[
          ...(all ? [{ value: 'all', label: 'Tất cả cơ sở' }] : []),
          ...(workspace.data?.stores ?? []).filter(row => all || row.id === user.storeId).map(row => ({ value: String(row.id), label: row.name })),
        ]} disabled={!all || busy || !!preview} onChange={value => { setStore(value); setError(''); setNotice(''); }} searchable />
        <FormField label="Tìm khách, xe hoặc mã hợp đồng" value={search} maxLength={300} onChangeText={setSearch} />
        <ChoiceField label="Trạng thái xử lý" value={handling} choices={[
          { value: '', label: 'Tất cả' }, ...Object.entries(HANDLING_STATUSES).map(([value, label]) => ({ value, label })),
        ]} onChange={setHandling} />
        <FileExportButton key={filters.toString()} disabled={!rows.length || query.isFetching || query.isError || search.trim() !== term}
          load={signal => api!.collectionReportExcel(filters, signal)} />
        {user.permissions.includes('contracts.draft') && <Button secondary label="Xem trước và gửi Telegram PGD"
          disabled={!canSend || !data || query.isFetching || query.isError || busy} onPress={() => {
            if (data) { setError(''); setPreview({ store, hash: data.hash, messages: data.messages }); }
          }} />}
        {store === 'all' && <Text style={muted}>Chọn một PGD để gửi báo cáo Telegram.</Text>}
        {data?.deliveries.length ? <Text style={text}>
          Telegram · {data.deliveries.filter(row => row.status === 'sent').length}/{data.messages.length} tin đã gửi.
          {data.deliveries.some(row => row.status === 'unknown') ? ' Có tin chưa rõ kết quả. Kiểm tra nhóm Telegram.' : ''}
          {data.deliveries.some(row => row.status === 'awaiting_config') ? ' PGD chưa có cấu hình gửi Telegram.' : ''}
          {data.deliveries.some(row => row.status === 'failed') ? ' Có tin gửi thất bại.' : ''}
          {data.deliveries.some(row => row.status === 'pending' || row.status === 'sending') ? ' Đang chờ gửi.' : ''}
        </Text> : null}
        {!!notice && <Text style={text} accessibilityLiveRegion="polite">{notice}</Text>}
        {!preview && !!error && <InlineError message={error} />}
        {data && <Text style={muted}>{rows.length} hợp đồng · Đọc lúc {dateTime(data.read_at)}</Text>}
      </View>}
      ListEmptyComponent={!store ? <StateView title="Tài khoản chưa được gán PGD" />
        : query.isPending ? <StateView title="Đang tải báo cáo nợ chậm" loading />
        : query.isError ? <StateView title="Chưa tải được báo cáo nợ chậm" message={query.error.message} retry={() => { void query.refetch(); }} />
          : <StateView title="Không có hợp đồng nợ chậm phù hợp" />}
      renderItem={({ item }) => <Card style={{ gap: 9 }}>
        <Text accessibilityRole="header" style={{ ...text, fontSize: 18, fontWeight: '800' }}>{item.code} · {item.customer}</Text>
        <Text style={muted}>{item.store_name} · {item.vehicle || 'Chưa có biển số'}</Text>
        <Text style={text}>{item.days} ngày quá hạn · Nợ đến hạn {money(item.amount)}</Text>
        {item.late_fee !== null && <Text style={muted}>Phí quá hạn tạm tính {money(item.late_fee)}</Text>}
        <Text style={muted}>Hạn trả {dateTime(item.due_at)} · GPS {item.gps.map(state => GPS_STATE_LABELS[state] ?? state).join(', ') || 'Chưa có'}</Text>
        <Text style={text}>{CONTACT_STATUSES[item.followup.contact_status]} · {HANDLING_STATUSES[item.followup.handling_status]}</Text>
        <Text style={text}>{item.followup.customer_condition || item.customer_status}</Text>
        {!!item.followup.notes && <Text style={muted} numberOfLines={3}>{item.followup.notes}</Text>}
        <Button secondary label="Tình trạng khách và ghi chú" onPress={() => router.push({
          pathname: '/collection-followup/[id]', params: { id: String(item.id) },
        })} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button equalWidth secondary label="Mở hợp đồng" onPress={() => router.push({ pathname: '/record/[kind]/[id]', params: { kind: 'contracts', id: String(item.id) } })} />
          {!!item.phone && <Button equalWidth secondary label={`Gọi ${item.phone}`} onPress={() => call(item.phone)} />}
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
  </>;
}

export default function Route() {
  const { api, session } = useSession();
  if (!api || !session?.user.permissions.includes('contracts.read')) return <StateView title="Không có quyền xem báo cáo nợ chậm" />;
  return <CollectionReport key={`${api.origin}:${session.user.id}:${session.user.storeId}:${session.user.allStores}:${session.user.allStoresRead}`} />;
}
