import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SHIFT_REPORT_DESCRIPTION, SHIFT_REPORT_PROGRESS, matchesShiftReportProgress, type ShiftReportProgress } from '../../../shared/shift-report-workflow';
import { useSession } from '@/providers/session';
import { useTheme, money } from '@/theme';
import { Button, Card, InlineError, StateView } from '@/components/ui';
import { ChoiceField } from '@/components/form-fields';
import { DateField } from '@/components/date-field';
import { FilteredListExport } from '@/components/filtered-list-export';

function List() {
  const { api, session } = useSession(), theme = useTheme();
  const [store, setStore] = useState(session!.user.allStores ? 'all' : String(session!.user.storeId || 'all'));
  const [date, setDate] = useState(''), [status, setStatus] = useState<ShiftReportProgress>('all');
  const allowed = session!.user.permissions.includes('contracts.read');
  const options = useQuery({ queryKey: ['shift-options', session!.user.id], queryFn: ({ signal }) => api!.shiftOptions(signal), enabled: allowed });
  const params = new URLSearchParams({ ...(store !== 'all' ? { store_id: store } : {}), ...(date ? { date } : {}) }).toString();
  const query = useQuery({ queryKey: ['shifts', session!.user.id, params], queryFn: ({ signal }) => api!.shifts(params, signal), enabled: allowed, retry: false });
  if (!allowed) return <StateView title="Không có quyền xem báo cáo ca" />;
  const rows = query.data?.rows.filter(row => matchesShiftReportProgress(row, status)) || [];
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1 }}>
    <FlatList data={rows} keyExtractor={row => String(row.id)} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 18, maxWidth: 760, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} tintColor={theme.primary} onRefresh={() => { void query.refetch(); void options.refetch(); }} />}
      ListHeaderComponent={<View style={{ gap: 16 }}>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 28, fontWeight: '800' }}>Báo cáo cuối ca</Text>
        <Text style={{ color: theme.muted, lineHeight: 24 }}>{SHIFT_REPORT_DESCRIPTION}</Text>
        {options.data?.canWrite && <Button label="+ Tạo báo cáo" onPress={() => router.push({ pathname: '/shift-editor/[id]', params: { id: 'new', ...(store !== 'all' ? { store_id: store } : {}) } })} />}
        <FilteredListExport kind="shifts" filters={new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(params)), status }).toString()} disabled={query.isPending || query.isError || query.isFetching} limitText="Xuất toàn bộ báo cáo theo cơ sở, ngày và tiến độ đang chọn, gồm cả báo cáo chưa tải trong danh sách." />
        <Button secondary label="Làm mới" loading={query.isFetching} onPress={() => { void query.refetch(); void options.refetch(); }} />
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 21, fontWeight: '700' }}>Báo cáo theo cơ sở</Text>
        <Text style={{ color: theme.muted, lineHeight: 22 }}>100 báo cáo gần nhất trong phạm vi PGD đang chọn. Chọn ngày để xem báo cáo cũ. Mỗi PGD có một báo cáo mỗi ngày.</Text>
        <ChoiceField label="Cơ sở" value={store} searchable choices={[...(session!.user.allStores ? [{ value: 'all', label: 'Tất cả cơ sở' }] : []), ...(options.data?.stores || []).filter(s => session!.user.allStores || s.id === session!.user.storeId).map(s => ({ value: String(s.id), label: s.name }))]} onChange={setStore} />
        <DateField label="Xem ngày" value={date} onChange={setDate} />
        <ChoiceField label="Tiến độ báo cáo" value={status} choices={[...SHIFT_REPORT_PROGRESS]} onChange={value => setStatus(value as ShiftReportProgress)} />
        {options.isError && <InlineError message={options.error.message} />}
        {query.isError && rows.length > 0 && <InlineError message={query.error.message} />}
        {query.data && <Text style={{ color: theme.muted }}>{rows.length} báo cáo phù hợp</Text>}
      </View>}
      renderItem={({ item: row }) => <Card style={{ gap: 12 }}>
        <Text style={{ color: theme.text, fontSize: 21, fontWeight: '800' }}>{row.payload.date.split('-').reverse().join('/')} · {row.store_name}</Text>
        <Text style={{ color: theme.text }}>Nhân sự trực ca: {row.payload.staff}</Text>
        <Text style={{ color: theme.text }}>Xe tại PGD / Pin: {row.payload.vehicles} xe / {row.payload.batteries} pin</Text>
        <Text style={{ color: theme.text }}>Tiền mặt: {money(row.payload.cash)}</Text>
        <Text style={{ color: theme.muted }}>PGD: {row.status === 'draft' ? 'Bản nháp' : 'Đã chốt'} · {row.created_by_name}</Text>
        <Text style={{ color: theme.muted }}>KTNB: {row.status === 'draft' ? 'Chưa gửi' : row.audit?.status === 'confirmed' ? row.audit.result === 'matched' ? 'Đã xác nhận · Khớp' : 'Có chênh lệch' : row.audit ? 'Đang đối soát' : 'Chờ đối soát'}</Text>
        <Button label="Mở báo cáo" onPress={() => router.push({ pathname: '/shift/[id]', params: { id: String(row.id) } })} />
        {row.status === 'submitted' && <Button secondary label={options.data?.canReview && row.audit?.status !== 'confirmed' ? 'Đối soát KTNB' : 'Xem đối soát'} onPress={() => router.push({ pathname: '/shift-audit/[id]', params: { id: String(row.id) } })} />}
      </Card>}
      ListEmptyComponent={query.isPending ? <StateView title="Đang tải báo cáo…" loading /> : query.isError ? <StateView title="Chưa tải được báo cáo" message={query.error.message} retry={() => void query.refetch()} /> : <StateView title="Chưa có báo cáo phù hợp." />}
    />
  </SafeAreaView>;
}
export default function Route() {
  const { api, session } = useSession();
  if (!api || !session) return <StateView title="Đăng nhập để xem báo cáo ca" />;
  return <List key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}`} />;
}
