import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, usePreventRemove } from 'expo-router';
import type { MobileCustomerImportPreview, MobileCustomerImportInput, CustomerImportRow } from '../../../shared/mobile-customer-import';
import { useSession } from '@/providers/session';
import { useCustomerImportWrite } from '@/hooks/use-customer-import-write';
import { useCsvExport } from '@/hooks/use-csv-export';
import { pickWorkbook, type PickedWorkbook } from '@/lib/pick-workbook';
import { dateTime, statuses, useTheme } from '@/theme';
import { Button, Card, InlineError, StateView } from '@/components/ui';
import { ChoiceField } from '@/components/form-fields';
import { ConfirmEdit } from '@/components/editor-sheet';

export default function CustomerImportScreen() {
  const { api, session } = useSession();
  if (!api || !session || !session.user.permissions.includes('settings.write')) return <StateView title="Không có quyền nhập Excel khách hàng" />;
  return <CustomerImporter key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}`} />;
}
function CustomerImporter() {
  const { api } = useSession(), theme = useTheme(), csv = useCsvExport(), [preview, setPreview] = useState<MobileCustomerImportPreview | null>(null), [picked, setPicked] = useState<PickedWorkbook | null>(null), [allowIncomplete, setAllowIncomplete] = useState(false), [selected, setSelected] = useState<Set<number>>(new Set()), [page, setPage] = useState(1), [filter, setFilter] = useState('all'), [loading, setLoading] = useState(false), [error, setError] = useState(''), [needsReview, setNeedsReview] = useState(false), [confirm, setConfirm] = useState<MobileCustomerImportInput | null>(null), [exit, setExit] = useState<(() => void) | null>(null);
  const write = useCustomerImportWrite(preview?.batchId || null), epoch = useRef(0), controller = useRef<AbortController | null>(null), reading = useRef(false), list = useRef<FlatList<CustomerImportRow>>(null);
  useEffect(() => { const version = ++epoch.current; return () => { epoch.current = version + 1; controller.current?.abort(); }; }, []);
  const disabled = loading || write.busy || !!write.key, disablePrevention = usePreventRemove(loading || write.busy || (!!preview || !!picked) && !write.key, ({ repeat }) => setExit(() => repeat));
  const text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  async function inspect(file?: PickedWorkbook) {
    if (disabled || reading.current || !api || !file && !preview) return;
    const version = epoch.current; reading.current = true; setLoading(true); setError(''); controller.current = new AbortController();
    try {
      const next = file ? await api.previewCustomerFile(file.name, file.bytes.buffer, allowIncomplete, controller.current.signal) : await api.previewCustomerImport(preview!, allowIncomplete, controller.current.signal);
      if (epoch.current !== version) return;
      setPreview(next); setPicked(null); setSelected(new Set(next.result.rows.filter(r => r.state === 'valid').map(r => r.rowNumber))); setPage(1); setFilter('all'); setNeedsReview(false); list.current?.scrollToOffset({ offset: 0, animated: false });
    } catch (cause) { if (epoch.current === version) setError((cause as Error).message); }
    finally { reading.current = false; if (epoch.current === version) setLoading(false); }
  }
  async function chooseFile() {
    if (disabled || reading.current) return;
    const version = epoch.current; reading.current = true; setLoading(true); setError('');
    try {
      const file = await pickWorkbook(); if (epoch.current !== version || !file) return;
      setPicked(file); setPreview(null); setSelected(new Set());
      // Release the picker lock before the separate read-only preview request.
      reading.current = false; setLoading(false); await inspect(file);
    } catch (cause) { if (epoch.current === version) setError((cause as Error).message); }
    finally { reading.current = false; if (epoch.current === version) setLoading(false); }
  }
  const rows = preview?.result.rows || [], filtered = rows.filter(r => filter === 'all' || r.state === filter), pages = Math.max(1, Math.ceil(filtered.length / 25)), current = Math.min(page, pages), pageRows = filtered.slice((current - 1) * 25, current * 25), chosen = rows.filter(r => r.state === 'valid' && selected.has(r.rowNumber));
  const mustReview = needsReview || preview?.allowIncomplete !== allowIncomplete;
  return <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: theme.background }}><Stack.Screen options={{ title: 'Nhập Excel khách hàng' }} />
    <FlatList<CustomerImportRow> ref={list} data={write.key ? [] : pageRows} keyExtractor={r => String(r.rowNumber)} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled"
      ListHeaderComponent={<View style={{ gap: 14, marginBottom: 10 }}>
        {!!error && <InlineError message={error} />}{!!write.error && <InlineError message={write.error} />}{!!write.notice && <Text style={muted}>{write.notice}</Text>}
        {preview && write.query.isError && <StateView title="Chưa kiểm tra được mã lần nhập trước" message={(write.query.error as Error).message} retry={() => void write.query.refetch()} />}
        {write.key ? <Card style={{ gap: 12 }}><Text selectable style={muted}>Mã lần nhập: {write.key}</Text>{write.proof ? <><Text accessibilityRole="header" style={{ ...text, fontSize: 22, fontWeight: '700' }}>Đã nhập {write.proof.count} khách hàng</Text><Text style={muted}>Ghi nhận {dateTime(write.proof.recordedAt)}. Kết quả của lần gửi; hồ sơ có thể đã được chỉnh sửa tiếp.</Text><Button label="Đã xem kết quả, về danh sách khách" loading={write.busy} onPress={() => void write.acknowledge(disablePrevention)} /></> : <><Text style={text}>Đối chiếu kết quả lần nhập đã gửi trước khi nhập tiếp.</Text><Button label="Đối chiếu kết quả nhập Excel" loading={write.busy} onPress={() => { void write.resolve().then(status => { if (status === 'cancelled') setNeedsReview(true); }); }} /><Button secondary label="Mở mã lần nhập trong Tài khoản" disabled={write.busy} onPress={() => router.push('/(tabs)/account')} /></>}</Card> : <>
          <Card style={{ gap: 10 }}><Text accessibilityRole="header" style={{ ...text, fontSize: 22, fontWeight: '700' }}>1. Mẫu và file Excel</Text><Text style={text}>Dùng file .xlsx tối đa 5 MB, 1.000 khách hàng. Giữ điện thoại và CCCD/CMND dạng Text để không mất số 0 đầu.</Text><Text style={muted}>Hệ thống kiểm tra trước khi nhập, báo dòng lỗi/trùng và giữ hồ sơ đã có. File gốc được giữ trên thiết bị.</Text></Card>
          <Button secondary label="Tải mẫu Excel khách hàng" loading={csv.busy} disabled={disabled} onPress={() => void csv.run(signal => api!.customerImportTemplate(signal))} />
          {!!csv.error && <InlineError message={csv.error} />}{!!csv.message && <Text style={muted}>{csv.message}</Text>}
          <ChoiceField label="Hồ sơ Chưa hoàn tất thiếu CCCD / địa chỉ" value={allowIncomplete ? 'yes' : 'no'} choices={[{ value: 'no', label: 'Yêu cầu đủ CCCD và địa chỉ' }, { value: 'yes', label: 'Cho phép nếu trạng thái là Chưa hoàn tất' }]} disabled={disabled} onChange={v => setAllowIncomplete(v === 'yes')} />
          <Text style={muted}>Tên, điện thoại và cơ sở luôn bắt buộc. Chế độ cho phép thiếu chỉ áp dụng dòng có trạng thái Chưa hoàn tất.</Text>
          <Button label={preview || picked ? 'Chọn file Excel khác' : 'Chọn file Excel khách hàng'} loading={loading} disabled={write.busy} onPress={() => void chooseFile()} />
          {picked && <><Text style={text}>File đang kiểm tra: {picked.name}</Text><Button secondary label="Thử kiểm tra lại file đã chọn" disabled={disabled} onPress={() => void inspect(picked)} /></>}
          {preview && <>
            <Card style={{ gap: 10 }}><Text accessibilityRole="header" style={{ ...text, fontSize: 21, fontWeight: '700' }}>2. Kiểm tra và chọn dòng</Text><Text style={text}>{preview.filename}</Text><Text accessibilityLiveRegion="polite" style={text}>{preview.result.total} dòng · Hợp lệ {preview.result.valid} · Lỗi {preview.result.invalid} · Trùng {preview.result.duplicate}</Text><Text style={text}>Đã chọn {chosen.length} dòng hợp lệ; {preview.result.incomplete} hồ sơ thiếu được cho phép.</Text>{mustReview && <InlineError message="Cần kiểm tra lại dữ liệu trước khi nhập với chế độ hiện tại." />}<Button secondary label="Kiểm tra lại dữ liệu Excel" disabled={disabled} onPress={() => void inspect()} /></Card>
            <ChoiceField label="Lọc dòng kiểm tra" value={filter} choices={[{ value: 'all', label: 'Tất cả dòng' }, { value: 'valid', label: 'Hợp lệ' }, { value: 'invalid', label: 'Lỗi' }, { value: 'duplicate', label: 'Trùng' }]} disabled={disabled} onChange={v => { setFilter(v); setPage(1); }} />
            <Button secondary label={chosen.length === preview.result.valid && chosen.length > 0 ? 'Bỏ chọn tất cả dòng hợp lệ' : 'Chọn tất cả dòng hợp lệ'} disabled={disabled || mustReview || preview.result.valid === 0} onPress={() => setSelected(chosen.length === preview.result.valid ? new Set() : new Set(rows.filter(r => r.state === 'valid').map(r => r.rowNumber)))} />
            <Text style={muted}>{filtered.length} kết quả · Trang {current}/{pages}</Text>
          </>}
        </>}
      </View>}
      renderItem={({ item }) => <Card style={{ gap: 8 }}><Text accessibilityRole="header" style={{ ...text, fontSize: 18, fontWeight: '700' }}>Dòng {item.rowNumber} · {item.state === 'valid' ? 'Hợp lệ' : item.state === 'duplicate' ? 'Trùng' : 'Lỗi'}</Text><Text selectable style={text}>{item.values.name || 'Chưa có tên'} · {item.values.phone || 'Chưa có điện thoại'}</Text><Text selectable style={muted}>CCCD/CMND: {item.values.id_card || 'Chưa có'} · Cơ sở: {item.values.store || 'Chưa có'}</Text><Text selectable style={muted}>Địa chỉ: {item.values.address || 'Chưa có'}{item.values.email ? ` · ${item.values.email}` : ''}</Text><Text style={muted}>Trạng thái: {item.values.status === 'draft' ? 'Chưa hoàn tất' : statuses[item.values.status] || item.values.status}</Text>{!!item.values.warning_note && <Text selectable style={text}>{item.values.warning_note}</Text>}{item.errors.map((e, i) => <Text key={i} style={text}>{e}</Text>)}{item.warnings.map((w, i) => <Text key={i} style={muted}>{w}</Text>)}{item.state === 'valid' && <Pressable accessibilityRole="checkbox" accessibilityLabel={`Chọn dòng ${item.rowNumber}`} accessibilityState={{ checked: selected.has(item.rowNumber), disabled: disabled || mustReview }} disabled={disabled || mustReview} onPress={() => setSelected(current => { const next = new Set(current); if (next.has(item.rowNumber)) next.delete(item.rowNumber); else next.add(item.rowNumber); return next; })} style={{ minHeight: 48, padding: 12, borderWidth: 1, borderColor: selected.has(item.rowNumber) ? theme.primary : theme.border, borderRadius: 10 }}><Text style={{ ...text, color: selected.has(item.rowNumber) ? theme.primary : theme.text }}>{selected.has(item.rowNumber) ? 'Đã chọn dòng này' : 'Chọn dòng này để nhập'}</Text></Pressable>}</Card>}
      ListFooterComponent={!write.key && preview && pages > 1 ? <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}><View style={{ flex: 1 }}><Button secondary label="Trang kiểm tra trước" disabled={disabled || current <= 1} onPress={() => setPage(current - 1)} /></View><View style={{ flex: 1 }}><Button secondary label="Trang kiểm tra sau" disabled={disabled || current >= pages} onPress={() => setPage(current + 1)} /></View></View> : undefined}
    />
    {preview && !write.key && <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.surface }}><Button label={`Kiểm tra và nhập ${chosen.length} khách đã chọn`} loading={write.busy} disabled={disabled || csv.busy || mustReview || !chosen.length || write.query.isPending || write.query.isError} onPress={() => setConfirm({ allowIncomplete: preview.allowIncomplete, rows: chosen.map(r => ({ rowNumber: r.rowNumber, values: r.values, errors: [] })) })} /></View>}
    {confirm && preview && <ConfirmEdit title="Nhập những khách hàng đã chọn?" message={`${preview.filename}\nNhập ${confirm.rows.length} khách hàng. Chỉ các dòng hợp lệ đã chọn được ghi; ${preview.result.total - confirm.rows.length} dòng còn lại không nhập.\n\nKhông cập nhật đè khách đã có. Hệ thống kiểm tra lại trùng trước khi ghi; nếu dữ liệu thay đổi, giữ file và kiểm tra lại.`} confirmLabel={`Xác nhận nhập ${confirm.rows.length} khách`} busy={write.busy} onCancel={() => setConfirm(null)} onConfirm={() => { const input = confirm; setConfirm(null); list.current?.scrollToOffset({ offset: 0, animated: false }); void write.save(input); }} />}
    {exit && <ConfirmEdit title="Rời màn nhập Excel?" message="Nội dung kiểm tra chưa nhập sẽ mất khi rời màn. File gốc vẫn được giữ. Lần nhập đã gửi có mã đối chiếu trong Tài khoản." confirmLabel="Rời màn nhập Excel" busy={loading || write.busy} onCancel={() => setExit(null)} onConfirm={() => { if (!loading && !write.busy) exit(); }} />}
  </SafeAreaView>;
}
