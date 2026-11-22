import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, SlidersHorizontal } from 'lucide-react-native';
import { SHIFT_REPORT_DESCRIPTION, SHIFT_REPORT_PROGRESS, matchesShiftReportProgress, type ShiftReportProgress } from '../../../shared/shift-report-workflow';
import { shiftReportTypeLabel, type ShiftReportType } from '../../../shared/mobile-shift-reports';
import { useSession } from '@/providers/session';
import { useGlobalBranch } from '@/providers/branch';
import { useTheme, money } from '@/theme';
import { Button, Card, Chip, InlineError, KeyValueRow, SegmentedBar, StateView, StatusBadge } from '@/components/ui';
import { ChoiceField } from '@/components/form-fields';
import { DateField } from '@/components/date-field';
import { FilteredListExport } from '@/components/filtered-list-export';

function ShiftReportsList({ initialReportType }: { initialReportType: ShiftReportType }) {
  const { api, session } = useSession(), theme = useTheme();
  const canReadAll = Boolean(session!.user.allStores || session!.user.allStoresRead);
  const defaultStore = canReadAll ? 'all' : String(session!.user.storeId || 'all');
  const { selectedStore: globalStore, selectStore: setGlobalStore } = useGlobalBranch(defaultStore);
  const store = canReadAll ? (globalStore || defaultStore) : defaultStore;
  const setStore = (next: string) => { if (canReadAll) setGlobalStore(next); };
  const [reportType, setReportType] = useState<ShiftReportType>(initialReportType);
  const [date, setDate] = useState(''), [status, setStatus] = useState<ShiftReportProgress>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const allowed = session!.user.permissions.includes('contracts.read');
  const options = useQuery({ queryKey: ['shift-options', session!.user.id, session!.user.allStores, session!.user.allStoresRead], queryFn: ({ signal }) => api!.shiftOptions(signal), enabled: allowed });
  const params = new URLSearchParams({ report_type: reportType, ...(store !== 'all' ? { store_id: store } : {}), ...(date ? { date } : {}) }).toString();
  const query = useQuery({ queryKey: ['shifts', session!.user.id, session!.user.allStores, session!.user.allStoresRead, params], queryFn: ({ signal }) => api!.shifts(params, signal), enabled: allowed, retry: false });
  if (!allowed) return <StateView title="Không có quyền xem báo cáo ca" />;
  const midShift = reportType === 'mid_shift';
  const title = midShift ? 'Báo cáo giữa ca' : 'Báo cáo Hết ca';
  const rows = query.data?.rows.filter(row => matchesShiftReportProgress(row, status)) || [];
  const createStore = session!.user.allStores ? (store !== 'all' ? store : undefined) : (session!.user.storeId ? String(session!.user.storeId) : undefined);
  const filterCount = Number(store !== defaultStore) + Number(Boolean(date)) + Number(status !== 'all');
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background }}>
    <Stack.Screen options={{ title }} />
    <FlatList data={rows} keyExtractor={row => String(row.id)} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 12, maxWidth: 760, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} tintColor={theme.primary} onRefresh={() => { void query.refetch(); void options.refetch(); }} />}
      ListHeaderComponent={<View style={{ gap: 12 }}>
        <SegmentedBar
          value={reportType}
          onChange={setReportType}
          options={[
            { value: 'mid_shift', label: 'Báo cáo giữa ca' },
            { value: 'end_shift', label: 'Báo cáo Hết ca' },
          ]}
        />
        <View style={{ gap: 3 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>{title}</Text>
          <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19 }}>{midShift ? 'Kiểm kê xe, pin và tiền tại thời điểm giữa ca.' : SHIFT_REPORT_DESCRIPTION}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {options.data?.canWrite && (
            <Button
              size="sm"
              equalWidth
              icon={<Plus size={15} color={theme.primaryText} />}
              label={`Tạo ${title.toLowerCase()}`}
              onPress={() => router.push({ pathname: '/shift-editor/[id]', params: { id: 'new', report_type: reportType, ...(createStore ? { store_id: createStore } : {}) } })}
            />
          )}
          <Chip
            label={filterCount ? `Bộ lọc (${filterCount})` : 'Bộ lọc'}
            selected={filtersOpen || filterCount > 0}
            icon={<SlidersHorizontal size={14} color={filtersOpen || filterCount > 0 ? theme.primary : theme.text} />}
            onPress={() => setFiltersOpen(v => !v)}
          />
        </View>
        {filtersOpen && (
          <Card style={{ gap: 12 }}>
            <ChoiceField label="Cơ sở" value={store} searchable choices={[...(canReadAll ? [{ value: 'all', label: 'Tất cả cơ sở' }] : []), ...(options.data?.stores || []).filter(s => canReadAll || s.id === session!.user.storeId).map(s => ({ value: String(s.id), label: s.name }))]} onChange={setStore} />
            <DateField label="Xem ngày" value={date} onChange={setDate} />
            <ChoiceField label="Tiến độ báo cáo" value={status} choices={[...SHIFT_REPORT_PROGRESS]} onChange={value => setStatus(value as ShiftReportProgress)} />
            <FilteredListExport kind="shifts" filters={new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(params)), status }).toString()} disabled={query.isPending || query.isError || query.isFetching} limitText="Xuất toàn bộ báo cáo theo loại, cơ sở, ngày và tiến độ đang chọn." />
          </Card>
        )}
        {options.isError && <InlineError message={options.error.message} />}
        {query.isError && rows.length > 0 && <InlineError message={query.error.message} />}
        {query.data && <Text style={{ color: theme.muted, fontSize: 13 }}>{rows.length} báo cáo phù hợp · {(options.data?.stores || []).find(s => String(s.id) === store)?.name || 'Tất cả cơ sở'}</Text>}
      </View>}
      renderItem={({ item: row }) => {
        const auditStatus = row.status === 'draft' ? 'draft' : row.audit?.status === 'confirmed' ? (row.audit.result === 'matched' ? 'matched' : 'warning') : 'pending';
        const auditLabel = row.status === 'draft' ? 'KTNB: Chưa gửi' : row.audit?.status === 'confirmed' ? (row.audit.result === 'matched' ? 'KTNB: Khớp' : 'KTNB: Chênh lệch') : row.audit ? 'KTNB: Đang đối soát' : 'KTNB: Chờ đối soát';
        return (
          <Card style={{ gap: 9 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800', flex: 1 }}>
                {row.payload.date.split('-').reverse().join('/')} · {row.store_name}
              </Text>
              <StatusBadge status={row.status === 'draft' ? 'draft' : 'confirmed'} label={row.status === 'draft' ? 'Bản nháp' : 'Đã chốt'} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <StatusBadge status={auditStatus} label={auditLabel} />
              <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700' }}>{shiftReportTypeLabel(row.payload.report_type)}</Text>
            </View>
            <View style={{ gap: 2 }}>
              <KeyValueRow label="Nhân sự trực ca" value={row.payload.staff} />
              <KeyValueRow label="Xe tại PGD / Pin" value={`${row.payload.vehicles} xe / ${row.payload.batteries} pin`} />
              <KeyValueRow label="Tiền mặt két" strong value={money(row.payload.cash)} />
              <KeyValueRow label="Người lập" value={row.created_by_name} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, paddingTop: 2 }}>
              <Button size="sm" equalWidth label="Mở báo cáo" onPress={() => router.push({ pathname: '/shift/[id]', params: { id: String(row.id) } })} />
              {row.status === 'submitted' && (
                <Button size="sm" equalWidth secondary label={options.data?.canReview && row.audit?.status !== 'confirmed' ? 'Đối soát KTNB' : 'Xem đối soát'} onPress={() => router.push({ pathname: '/shift-audit/[id]', params: { id: String(row.id) } })} />
              )}
            </View>
          </Card>
        );
      }}
      ListEmptyComponent={query.isPending ? <StateView title="Đang tải báo cáo…" loading /> : query.isError ? <StateView title="Chưa tải được báo cáo" message={query.error.message} retry={() => void query.refetch()} /> : <StateView title="Chưa có báo cáo phù hợp." />}
    />
  </SafeAreaView>;
}

export function ShiftReportsScreen({ reportType = 'end_shift' }: { reportType?: ShiftReportType }) {
  const { api, session } = useSession();
  if (!api || !session) return <StateView title="Đăng nhập để xem báo cáo ca" />;
  return <ShiftReportsList key={`${reportType}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.allStoresRead}:${session.user.permissions.join(',')}`} initialReportType={reportType} />;
}
