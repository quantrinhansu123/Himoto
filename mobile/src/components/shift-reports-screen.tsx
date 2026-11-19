import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SHIFT_REPORT_DESCRIPTION, SHIFT_REPORT_PROGRESS, matchesShiftReportProgress, type ShiftReportProgress } from '../../../shared/shift-report-workflow';
import { shiftReportTypeLabel, type ShiftReportType } from '../../../shared/mobile-shift-reports';
import { useSession } from '@/providers/session';
import { useTheme, money } from '@/theme';
import { Button, Card, InlineError, StateView } from '@/components/ui';
import { ChoiceField } from '@/components/form-fields';
import { DateField } from '@/components/date-field';
import { FilteredListExport } from '@/components/filtered-list-export';

function ShiftReportsList({ initialReportType }: { initialReportType: ShiftReportType }) {
  const { api, session } = useSession(), theme = useTheme();
  const canReadAll = Boolean(session!.user.allStores || session!.user.allStoresRead);
  const [reportType, setReportType] = useState<ShiftReportType>(initialReportType);
  const [store, setStore] = useState(session!.user.allStores ? 'all' : String(session!.user.storeId || 'all'));
  const [date, setDate] = useState(''), [status, setStatus] = useState<ShiftReportProgress>('all');
  const allowed = session!.user.permissions.includes('contracts.read');
  const options = useQuery({ queryKey: ['shift-options', session!.user.id, session!.user.allStores, session!.user.allStoresRead], queryFn: ({ signal }) => api!.shiftOptions(signal), enabled: allowed });
  const params = new URLSearchParams({ report_type: reportType, ...(store !== 'all' ? { store_id: store } : {}), ...(date ? { date } : {}) }).toString();
  const query = useQuery({ queryKey: ['shifts', session!.user.id, session!.user.allStores, session!.user.allStoresRead, params], queryFn: ({ signal }) => api!.shifts(params, signal), enabled: allowed, retry: false });
  if (!allowed) return <StateView title="Không có quyền xem báo cáo ca" />;
  const midShift = reportType === 'mid_shift';
  const title = midShift ? 'Báo cáo giữa ca' : 'Báo cáo Hết ca';
  const rows = query.data?.rows.filter(row => matchesShiftReportProgress(row, status)) || [];
  const createStore = session!.user.allStores ? (store !== 'all' ? store : undefined) : (session!.user.storeId ? String(session!.user.storeId) : undefined);
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1 }}>
    <Stack.Screen options={{ title }} />
    <FlatList data={rows} keyExtractor={row => String(row.id)} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 18, maxWidth: 760, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} tintColor={theme.primary} onRefresh={() => { void query.refetch(); void options.refetch(); }} />}
      ListHeaderComponent={<View style={{ gap: 16 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {(['mid_shift', 'end_shift'] as const).map(type => {
            const active = reportType === type;
            const label = type === 'mid_shift' ? 'Báo cáo giữa ca' : 'Báo cáo Hết ca';
            return <Pressable key={type} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setReportType(type)}
              style={{ flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: active ? theme.primary : theme.controlBorder, backgroundColor: active ? theme.tint : theme.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }}>
              <Text style={{ color: active ? theme.primary : theme.text, fontWeight: active ? '700' : '600', fontSize: 14 }}>{label}</Text>
            </Pressable>;
          })}
        </View>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 28, fontWeight: '800' }}>{title}</Text>
        <Text style={{ color: theme.muted, lineHeight: 24 }}>{midShift ? 'Kiểm kê xe, pin và tiền tại thời điểm giữa ca.' : SHIFT_REPORT_DESCRIPTION}</Text>
        {options.data?.canWrite && <Button label={`+ Tạo ${title.toLowerCase()}`} onPress={() => router.push({ pathname: '/shift-editor/[id]', params: { id: 'new', report_type: reportType, ...(createStore ? { store_id: createStore } : {}) } })} />}
        <FilteredListExport kind="shifts" filters={new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(params)), status }).toString()} disabled={query.isPending || query.isError || query.isFetching} limitText="Xuất toàn bộ báo cáo theo loại báo cáo, cơ sở, ngày và tiến độ đang chọn." />
        <Button secondary label="Làm mới" loading={query.isFetching} onPress={() => { void query.refetch(); void options.refetch(); }} />
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 21, fontWeight: '700' }}>Báo cáo theo cơ sở</Text>
        <Text style={{ color: theme.muted, lineHeight: 22 }}>100 báo cáo gần nhất trong phạm vi PGD đang chọn. Chọn ngày để xem báo cáo cũ. Mỗi PGD có một báo cáo mỗi ngày cho loại báo cáo này.</Text>
        <ChoiceField label="Cơ sở" value={store} searchable choices={[...(canReadAll ? [{ value: 'all', label: 'Tất cả cơ sở' }] : []), ...(options.data?.stores || []).filter(s => canReadAll || s.id === session!.user.storeId).map(s => ({ value: String(s.id), label: s.name }))]} onChange={setStore} />
        <DateField label="Xem ngày" value={date} onChange={setDate} />
        <ChoiceField label="Tiến độ báo cáo" value={status} choices={[...SHIFT_REPORT_PROGRESS]} onChange={value => setStatus(value as ShiftReportProgress)} />
        {options.isError && <InlineError message={options.error.message} />}
        {query.isError && rows.length > 0 && <InlineError message={query.error.message} />}
        {query.data && <Text style={{ color: theme.muted }}>{rows.length} báo cáo phù hợp</Text>}
      </View>}
      renderItem={({ item: row }) => <Card style={{ gap: 12 }}>
        <Text style={{ color: theme.text, fontSize: 21, fontWeight: '800' }}>{row.payload.date.split('-').reverse().join('/')} · {row.store_name}</Text>
        <Text style={{ color: theme.primary, fontWeight: '700' }}>Loại báo cáo: {shiftReportTypeLabel(row.payload.report_type)}</Text>
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

export function ShiftReportsScreen({ reportType = 'end_shift' }: { reportType?: ShiftReportType }) {
  const { api, session } = useSession();
  if (!api || !session) return <StateView title="Đăng nhập để xem báo cáo ca" />;
  return <ShiftReportsList key={`${reportType}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.allStoresRead}:${session.user.permissions.join(',')}`} initialReportType={reportType} />;
}
