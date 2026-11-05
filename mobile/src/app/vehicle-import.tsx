import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Stack, router, usePreventRemove } from 'expo-router';
import { uuid } from 'expo';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MobileVehicleWorkbook, MobileVehicleImportInput, VehicleImportResult, VehicleImportRow, VehicleImportMode } from '../../../shared/mobile-vehicle-import';
import { useSession } from '@/providers/session';
import { useVehicleImportWrite } from '@/hooks/use-vehicle-import-write';
import { useCsvExport } from '@/hooks/use-csv-export';
import { pickWorkbook, type PickedWorkbook } from '@/lib/pick-workbook';
import { useTheme } from '@/theme';
import { Button, Card, InlineError, StateView } from '@/components/ui';
import { ChoiceField } from '@/components/form-fields';
import { ConfirmEdit } from '@/components/editor-sheet';
import { VehicleImportReceipt } from '@/components/vehicle-import-receipt';
import { VehicleImportReferences } from '@/components/vehicle-import-references';

export default function VehicleImportRoute() {
  const { api, session } = useSession();
  if (!api || !session || !session.user.permissions.includes('settings.write')) return <StateView title="Không có quyền nhập Excel xe" />;
  return <Importer key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}`} />;
}
function Importer() {
  const { api, session } = useSession(), theme = useTheme(), download = useCsvExport(), [batch] = useState(() => uuid.v4().toLowerCase()), [mode, setMode] = useState<VehicleImportMode>('sync'), write = useVehicleImportWrite(mode, batch);
  const [data, setData] = useState<MobileVehicleWorkbook | null>(null), [picked, setPicked] = useState<PickedWorkbook | null>(null), [review, setReview] = useState<VehicleImportResult | null>(null), [mapping, setMapping] = useState<Record<string, string>>({}), [skipUnknown, setSkipUnknown] = useState(false), [accepted, setAccepted] = useState(false), [page, setPage] = useState(1), [mappingPage, setMappingPage] = useState(1), [filter, setFilter] = useState('all'), [loading, setLoading] = useState(''), [error, setError] = useState(''), [confirm, setConfirm] = useState<MobileVehicleImportInput | null>(null), [exit, setExit] = useState<(() => void) | null>(null);
  const alive = useRef(true), running = useRef(false), controller = useRef<AbortController | null>(null), list = useRef<FlatList<VehicleImportRow>>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  const options = useQuery({ queryKey: ['vehicle-import-options', api?.origin, session?.user.id, session?.user.storeId, session?.user.allStores], queryFn: ({ signal }) => api!.vehicleImportOptions(signal), retry: false });
  const busy = !!loading || write.busy, disabled = busy || !!write.entry || write.query.isPending || write.query.isError || options.isPending || options.isError;
  const disablePrevention = usePreventRemove(busy || !!(data || picked) && !write.entry, ({ repeat }) => setExit(() => repeat));
  const stores = options.data?.stores || [], sourceStores = [...new Set(data?.rows.map(r => r.values.store) || [])].filter(value => value && (data?.legacy || !stores.some(s => [String(s.id), s.name, s.code].includes(value))));
  const mappingPages = Math.max(1, Math.ceil(sourceStores.length / 10)), mappedPage = Math.min(mappingPage, mappingPages), rows = review?.rows || [], visible = rows.filter(r => filter === 'all' || filter === 'issues' && (!!r.errors.length || r.warnings.some(w => !w.startsWith('Giữ ID'))) || r.state === filter), pages = Math.max(1, Math.ceil(visible.length / 25)), current = Math.min(page, pages), hasWarnings = !!review?.rows.some(r => r.warnings.length);
  const text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  function invalidateReview() { setReview(null); setAccepted(false); setError(''); setPage(1); }
  function input(revision = ''): MobileVehicleImportInput { return { rows: (data?.rows || []).map(r => ({ ...r, values: { ...r.values, store: mapping[r.values.store] || r.values.store } })), mode, revision, acceptWarnings: !!review && hasWarnings && accepted, skipUnknownStores: skipUnknown }; }
  async function read(file?: PickedWorkbook) {
    if (!api || disabled || running.current) return; running.current = true; setLoading('Đang chọn file Excel'); setError(''); controller.current = new AbortController();
    try {
      const source = file || await pickWorkbook(); if (!source || !alive.current) return;
      setPicked(source); setData(null); invalidateReview(); setMapping({}); setMappingPage(1); setFilter('all'); setLoading('Đang đọc và khớp cột Excel');
      const workbook = await api.vehicleWorkbook(source.name, source.bytes.buffer, controller.current.signal); if (!alive.current) return;
      setData(workbook); setPicked(null); setLoading('Đang kiểm tra xe và liên kết');
      const result = await api.previewVehicleImport({ rows: workbook.rows, mode, revision: '', acceptWarnings: false, skipUnknownStores: skipUnknown }, controller.current.signal);
      if (alive.current) { setReview(result); list.current?.scrollToOffset({ offset: 0, animated: false }); }
    } catch (cause) { if (alive.current) setError((cause as Error).message); }
    finally { running.current = false; controller.current = null; if (alive.current) setLoading(''); }
  }
  async function inspect() {
    if (!api || !data || disabled || running.current) return; running.current = true; setLoading('Đang kiểm tra lại danh sách'); setError(''); controller.current = new AbortController();
    try { const result = await api.previewVehicleImport({ ...input(), acceptWarnings: false }, controller.current.signal); if (alive.current) { setReview(result); setAccepted(false); setPage(1); } }
    catch (cause) { if (alive.current) { setReview(null); setError((cause as Error).message); } }
    finally { running.current = false; controller.current = null; if (alive.current) setLoading(''); }
  }
  return <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: theme.background }}><Stack.Screen options={{ title: 'Nhập và đồng bộ Excel xe' }} /><FlatList<VehicleImportRow> ref={list} data={write.entry ? [] : visible.slice((current - 1) * 25, current * 25)} keyExtractor={r => String(r.rowNumber)} contentContainerStyle={{ padding: 16, gap: 12 }}
    ListHeaderComponent={<View style={{ gap: 14, marginBottom: 8 }}>
      {!!error && <InlineError message={error} />}{!!write.error && <InlineError message={write.error} />}{!!write.notice && <Text style={muted}>{write.notice}</Text>}{!!loading && <StateView title={loading} loading />}
      {write.query.isPending && <StateView title="Đang kiểm tra mã Excel xe chờ" loading />}{write.query.isError && <StateView title="Chưa kiểm tra được mã Excel xe chờ" message={write.query.error.message} retry={() => void write.query.refetch()} />}
      {write.entry ? <><Text style={muted}>Đối chiếu thao tác đã gửi trước khi nhập tiếp.</Text>{write.proof ? <><VehicleImportReceipt receipt={write.proof} disabled={busy} /><Button label="Đã xem kết quả, về đội xe" loading={busy} onPress={() => void write.acknowledge(disablePrevention)} /></> : <Card style={{ gap: 12 }}><Text selectable style={muted}>Mã lần gửi: {write.entry.key}</Text><Text style={text}>Chưa rõ kết quả lần gửi. Đối chiếu mã gốc để tránh nhập hoặc xóa lặp.</Text><Button label="Đối chiếu thao tác Excel xe" loading={busy} onPress={() => void write.resolve().then(status => { if (status === 'cancelled') invalidateReview(); })} /></Card>}</> : <>
        <Card style={{ gap: 10 }}><Text accessibilityRole="header" style={{ ...text, fontSize: 22, fontWeight: '700' }}>Excel xe · kiểm tra trước khi ghi</Text><Text style={text}>File .xlsx tối đa 5 MB / 1.000 xe. Màu sắc, năm, biển số và cơ sở được đối chiếu từng dòng; cột thừa được liệt kê.</Text><Text style={muted}>Mỗi lần nhập tạo bản sao lưu cùng giao dịch. Có lỗi hoặc danh sách thay đổi sau kiểm tra sẽ hủy toàn bộ lần nhập.</Text></Card>
        {options.isPending && <StateView title="Đang tải cơ sở nhập xe" loading />}{options.isError && <StateView title="Chưa tải được cơ sở nhập xe" message={options.error.message} retry={() => void options.refetch()} />}
        <Button secondary label="Tải mẫu Excel xe" loading={download.busy} disabled={disabled} onPress={() => void download.run(signal => api!.vehicleImportTemplate(undefined, signal))} />
        {!!download.error && <InlineError message={download.error} />}{!!download.message && <Text accessibilityLiveRegion="polite" style={muted}>{download.message}</Text>}
        <ChoiceField label="Cách nhập xe" value={mode} choices={[{ value: 'sync', label: 'Đồng bộ giữ ID và lịch sử' }, { value: 'replace', label: 'Xóa xe cũ và thay toàn bộ từ file' }]} disabled={disabled || download.busy} onChange={v => { setMode(v as VehicleImportMode); invalidateReview(); }} />
        <Text style={muted}>{mode === 'sync' ? 'Xe đã có giữ ID, cơ sở, trạng thái và lịch sử. Cập nhật mô tả, giá và số km có dữ liệu; giá và số km để trống giữ giá trị cũ. Xe vắng mặt trong file vẫn được giữ.' : 'Thay toàn bộ danh sách xe trong phạm vi tài khoản, kể cả xe ngoài bộ lọc. Bị chặn nếu còn hợp đồng, ảnh, điều chuyển, bảo dưỡng hoặc liên kết khác.'}</Text>
        <ChoiceField label="Xe có cơ sở ngoài danh sách hiện tại" value={skipUnknown ? 'skip' : 'review'} choices={[{ value: 'review', label: 'Yêu cầu khớp lại cơ sở' }, { value: 'skip', label: 'Đối chiếu mã gốc, bỏ qua cơ sở ngoài danh sách' }]} disabled={disabled || download.busy} onChange={v => { setSkipUnknown(v === 'skip'); invalidateReview(); }} />
        <Button label={data || picked ? 'Chọn file Excel xe khác' : 'Chọn file Excel xe'} disabled={disabled || download.busy} onPress={() => void read()} />
        {picked && <><Text style={text}>{picked.name}</Text><Button secondary label="Thử đọc lại file xe đã chọn" disabled={disabled} onPress={() => void read(picked)} /></>}
        {data && <><Text style={text}>{data.filename}</Text>{data.legacy && <Card><Text style={text}>Đã khớp cấu trúc file cũ: biển số cột G, màu sắc Q, năm E, cơ sở F. {skipUnknown ? 'Đối chiếu mã cơ sở gốc; bỏ qua mã ngoài danh sách.' : 'Chọn lại cơ sở cũ; không tự suy ra mã tương ứng.'}</Text></Card>}{!!data.ignoredColumns.length && <Card><Text style={muted}>Các cột / nhóm cột bỏ qua: {data.ignoredColumns.join(' · ')}</Text></Card>}
          {!!sourceStores.length && <Card style={{ gap: 12 }}><Text accessibilityRole="header" style={{ ...text, fontSize: 19, fontWeight: '700' }}>Khớp cơ sở từ file · {sourceStores.length}</Text><Text style={muted}>Chọn cơ sở cho xe mới. Xe đã có giữ cơ sở đang sử dụng dù mã trong file khác.</Text>{sourceStores.slice((mappedPage - 1) * 10, mappedPage * 10).map(value => <ChoiceField key={value} label={`Cơ sở trong file: ${value}`} value={mapping[value] || ''} choices={[{ value: '', label: skipUnknown ? 'Dùng mã gốc nếu có, còn lại bỏ qua' : 'Chưa xác nhận / giữ giá trị trong file' }, ...stores.map(s => ({ value: String(s.id), label: `${s.name} · ${s.id}` }))]} disabled={disabled || download.busy} searchable onChange={v => { setMapping(current => ({ ...current, [value]: v })); invalidateReview(); }} />)}{mappingPages > 1 && <><Text style={muted}>Nhóm cơ sở {mappedPage}/{mappingPages}</Text><View style={{ flexDirection: 'row', gap: 12 }}><View style={{ flex: 1 }}><Button secondary label="Nhóm cơ sở trước" disabled={busy || mappedPage <= 1} onPress={() => setMappingPage(mappedPage - 1)} /></View><View style={{ flex: 1 }}><Button secondary label="Nhóm cơ sở sau" disabled={busy || mappedPage >= mappingPages} onPress={() => setMappingPage(mappedPage + 1)} /></View></View></>}</Card>}
          <Button secondary label="Kiểm tra lại xe và cơ sở đã khớp" disabled={disabled || download.busy} onPress={() => void inspect()} /><Button secondary label="Tải Excel đã khớp cột và cơ sở" loading={download.busy} disabled={disabled} onPress={() => void download.run(signal => api!.vehicleImportTemplate({ ...input(), acceptWarnings: false }, signal))} />
          {!review && <InlineError message="Kiểm tra lại sau khi đổi file, cách nhập hoặc cơ sở trước khi ghi." />}
        </>}
        {review && <><Card style={{ gap: 10 }}><Text accessibilityRole="header" style={{ ...text, fontSize: 20, fontWeight: '700' }}>Đối chiếu {review.total} dòng xe</Text><Text style={text}>Hợp lệ {review.valid} · Lỗi {review.invalid} · Bỏ qua {review.skipped}</Text><Text style={text}>Cập nhật {review.updated} · Thêm {review.inserted} · Chưa có màu {review.blankColors}</Text><Text style={muted}>{mode === 'sync' ? `Giữ ${review.retained} xe ngoài phần nhập.` : `Sẽ thay ${review.existing} xe hiện tại.`}</Text>{review.blocking.map(b => <InlineError key={b} message={b} />)}<VehicleImportReferences references={review.references} /></Card>
          <ChoiceField label="Lọc dòng xe Excel" value={filter} choices={[{ value: 'all', label: 'Tất cả dòng' }, { value: 'issues', label: 'Dòng lỗi / cần đối chiếu' }, { value: 'valid', label: 'Hợp lệ' }, { value: 'invalid', label: 'Lỗi' }, { value: 'skipped', label: 'Bỏ qua' }]} disabled={busy} onChange={v => { setFilter(v); setPage(1); }} />
          {hasWarnings && <ChoiceField label="Xác nhận đối chiếu cảnh báo xe" value={accepted ? 'yes' : 'no'} choices={[{ value: 'no', label: 'Chưa xác nhận' }, { value: 'yes', label: 'Đã đối chiếu; màu chưa rõ để trống, giữ liên kết' }]} disabled={disabled} onChange={v => setAccepted(v === 'yes')} />}
          <Text style={muted}>{visible.length} kết quả · Trang {current}/{pages}</Text>
        </>}
        {!data && !picked && <Button secondary label="Kiểm tra xóa danh sách xe có sao lưu" disabled={disabled || download.busy} onPress={() => router.push('/vehicle-reset')} />}
      </>}
    </View>}
    renderItem={({ item }) => <Card style={{ gap: 8 }}><Text accessibilityRole="header" style={{ ...text, fontSize: 18, fontWeight: '700' }}>Dòng {item.rowNumber} · {item.state === 'skipped' ? 'Bỏ qua' : item.state === 'invalid' ? 'Lỗi' : item.action === 'update' ? 'Cập nhật' : 'Thêm mới'}</Text><Text selectable style={text}>{item.values.name || 'Chưa có tên'} · {item.values.license || 'Chưa có biển số'}</Text><Text style={muted}>ID: {item.targetId || item.values.id || 'Mới'} · Màu: {item.values.color || 'Chưa có'}</Text><Text style={muted}>{options.data?.types.find(t => t.value === item.values.type)?.label || item.values.type} · {item.values.brand} · {item.values.year}</Text><Text selectable style={muted}>Số khung: {item.values.chassis || 'Chưa có'} · Số máy: {item.values.engine || 'Chưa có'}</Text><Text style={muted}>Số km: {item.values.odometer || 'Chưa ghi'} · Giá ngày: {item.values.daily_price || 'Để trống'} · Giá tháng: {item.values.monthly_price || 'Để trống'}</Text><Text style={text}>Cơ sở trong file: {item.values.store || 'Chưa có'}</Text><Text style={muted}>Trạng thái trong file: {options.data?.statuses.find(s => s.value === item.values.status)?.label || item.values.status}</Text>{item.errors.map((e, i) => <Text key={`e${i}`} style={text}>{e}</Text>)}{item.warnings.map((w, i) => <Text key={`w${i}`} style={muted}>{w}</Text>)}</Card>}
    ListFooterComponent={!write.entry && pages > 1 ? <View style={{ flexDirection: 'row', gap: 12 }}><View style={{ flex: 1 }}><Button secondary label="Trang xe trước" disabled={busy || current <= 1} onPress={() => setPage(current - 1)} /></View><View style={{ flex: 1 }}><Button secondary label="Trang xe sau" disabled={busy || current >= pages} onPress={() => setPage(current + 1)} /></View></View> : undefined}
  />{review && !write.entry && <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: theme.border }}><Button label={`${mode === 'sync' ? 'Kiểm tra và đồng bộ' : 'Kiểm tra và thay bằng'} ${review.total - review.skipped} xe`} loading={write.busy} disabled={disabled || download.busy || !review.valid || review.invalid > 0 || !!review.blocking.length || hasWarnings && !accepted} onPress={() => setConfirm(input(review.revision))} /></View>}
  {confirm && review && <ConfirmEdit title={mode === 'sync' ? 'Đồng bộ xe từ Excel?' : 'Thay toàn bộ danh sách xe?'} message={`${data?.filename}\nCập nhật ${review.updated} xe, thêm ${review.inserted} xe; bỏ qua ${review.skipped} dòng. ${mode === 'sync' ? `Giữ ${review.retained} xe ngoài phần nhập.` : `Xóa ${review.existing} xe hiện tại trong phạm vi rồi nhập danh sách mới.`}\n\nĐã đối chiếu cơ sở, cảnh báo và các cột giá/số km. Tạo bản sao lưu cùng giao dịch; có lỗi hoặc dữ liệu thay đổi sẽ hủy toàn bộ.`} confirmLabel={mode === 'sync' ? 'Xác nhận đồng bộ xe' : 'Xác nhận thay danh sách xe'} busy={write.busy} onCancel={() => setConfirm(null)} onConfirm={() => { const body = confirm; setConfirm(null); list.current?.scrollToOffset({ offset: 0, animated: false }); void write.save(body); }} />}
  {exit && <ConfirmEdit title="Rời màn Excel xe?" message="Nội dung đối chiếu chưa gửi sẽ mất. File gốc vẫn được giữ. Thao tác đã gửi có mã đối chiếu trong Tài khoản." confirmLabel="Rời màn Excel xe" busy={busy} onCancel={() => setExit(null)} onConfirm={() => { if (!busy) exit(); }} />}
  </SafeAreaView>;
}
