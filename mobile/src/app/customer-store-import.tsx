import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, usePreventRemove } from 'expo-router';
import { uuid } from 'expo';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CustomerStoreInput, CustomerStoreResult, CustomerStoreRow, MobileStoreMatchFilePage } from '../../../shared/mobile-customer-store-import';
import type { MobileImportReceipt } from '../../../shared/mobile-customer-import';
import { useSession } from '@/providers/session';
import { pendingWrites } from '@/lib/pending-writes';
import { pickWorkbook, type PickedWorkbook } from '@/lib/pick-workbook';
import { useCsvExport } from '@/hooks/use-csv-export';
import { dateTime, useTheme } from '@/theme';
import { Button, Card, InlineError, StateView } from '@/components/ui';
import { ChoiceField } from '@/components/form-fields';
import { ConfirmEdit } from '@/components/editor-sheet';

interface Batch { id: string; inputs: CustomerStoreInput[]; result: CustomerStoreResult }
interface Intent { key: string; operation: string; counted: boolean; expected: number }
export default function CustomerStoreImportRoute() {
  const { api, session } = useSession();
  if (!api || !session || !session.user.permissions.includes('settings.write')) return <StateView title="Không có quyền khớp cơ sở từ Excel" />;
  return <Importer key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}`} />;
}
function Importer() {
  const { api, session } = useSession(), theme = useTheme(), cache = useQueryClient(), download = useCsvExport();
  const scope = useMemo(() => ({ origin: api!.origin, userId: session!.user.id, storeId: session!.user.allStores ? null : session!.user.storeId, allStores: session!.user.allStores }), [api, session]);
  const [file, setFile] = useState<PickedWorkbook | null>(null), [batches, setBatches] = useState<Batch[]>([]), [stage, setStage] = useState(''), [error, setError] = useState(''), [progress, setProgress] = useState(''), [needsReview, setNeedsReview] = useState(true), [confirmed, setConfirmed] = useState(0), [intent, setIntent] = useState<Intent | null>(null), [proof, setProof] = useState<MobileImportReceipt | null>(null), [done, setDone] = useState(false), [confirm, setConfirm] = useState(false), [exit, setExit] = useState<(() => void) | null>(null), [filter, setFilter] = useState('all'), [page, setPage] = useState(1);
  const alive = useRef(true), running = useRef(false), controller = useRef<AbortController | null>(null), list = useRef<FlatList<CustomerStoreRow>>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  const pending = useQuery({ queryKey: ['store-match-pending', scope], gcTime: 0, retry: false, refetchOnWindowFocus: false, queryFn: async () => (await pendingWrites.list(scope, true)).filter(p => p.operation.startsWith('import.')) });
  const blocked = pending.isPending || pending.isError || !!pending.data?.length, busy = !!stage, disabled = busy || !!intent || blocked;
  const disablePrevention = usePreventRemove(busy || !!file && !intent && !done, ({ repeat }) => setExit(() => repeat));
  const rows = batches.flatMap(b => b.result.rows), visible = rows.filter(r => filter === 'all' || r.state === filter), pages = Math.max(1, Math.ceil(visible.length / 25)), current = Math.min(page, pages), ready = batches.reduce((n, b) => n + b.result.ready, 0), unchanged = batches.reduce((n, b) => n + b.result.unchanged, 0), invalid = batches.reduce((n, b) => n + b.result.invalid, 0);
  const text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  function invalidate() { for (const queryKey of [['catalogue'], ['record'], ['overview'], ['customer-matches'], ['draft-lookups']]) void cache.invalidateQueries({ queryKey }); }
  function requireProof(value: MobileImportReceipt | null, target: Intent) {
    if (!value || value.key !== target.key || value.operation !== target.operation || value.actorId !== scope.userId || value.kind !== 'customer_stores' || value.count !== target.expected) throw Error('Chưa đối chiếu đủ khách hàng trong phần đã gửi. Giữ mã để kiểm tra.');
    return value;
  }
  async function inspect(picked?: PickedWorkbook) {
    if (running.current || intent || blocked || !api) return;
    running.current = true; setStage('Đang chọn file Excel'); setError(''); setDone(false); setNeedsReview(true); setConfirm(false); controller.current = new AbortController();
    try {
      const source = picked || await pickWorkbook(); if (!source || !alive.current) return;
      setFile(source); setBatches([]); setPage(1); setFilter('all');
      const parts: MobileStoreMatchFilePage[] = []; setStage('Đang đọc Excel');
      await api.storeMatchFile(source.name, source.bytes.buffer, part => { parts.push(part); if (alive.current) setProgress(`Đã đọc ${part.offset + part.inputs.length}/${part.total} dòng.`); }, controller.current.signal);
      const checked: Batch[] = []; let processed = 0; setStage('Đang đối chiếu cơ sở');
      for (const part of parts) {
        const result = await api.previewStoreMatch(part.inputs, controller.current.signal); if (!alive.current) return;
        checked.push({ id: uuid.v4().toLowerCase(), inputs: part.inputs, result }); processed += result.total; setProgress(`Đã đối chiếu ${processed}/${part.total} dòng · Phần ${checked.length}/${parts.length}.`);
      }
      if (alive.current) { setBatches(checked); setNeedsReview(false); list.current?.scrollToOffset({ offset: 0, animated: false }); }
    } catch (cause) { if (alive.current) setError((cause as Error).message || 'Chưa đọc đủ file Excel. Thử kiểm tra lại.'); }
    finally { running.current = false; controller.current = null; if (alive.current) setStage(''); }
  }
  async function save() {
    if (!api || running.current || disabled || needsReview || !ready) return;
    running.current = true; setStage('Đang cập nhật từng phần'); setError(''); setConfirm(false); setPage(1); list.current?.scrollToOffset({ offset: 0, animated: false });
    try {
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i]; if (!batch.result.ready) continue;
        const operation = `import.cstores:${batch.id}`, previous = (await pendingWrites.list(scope, true)).filter(p => p.operation.startsWith('import.')).map(p => p.operation);
        const savedIntent = await pendingWrites.reserveExclusive(scope, operation, [...new Set([operation, ...previous])], () => uuid.v4().toLowerCase());
        if (savedIntent.operation !== operation) throw Error('Còn lần nhập Excel chưa đối chiếu. Mở Tài khoản để xử lý mã gốc trước.');
        const active: Intent = { key: savedIntent.key, operation, expected: batch.result.ready, counted: false }; if (!alive.current) return; setIntent(active); setProof(null);
        const result = requireProof(savedIntent.created ? await api.saveStoreMatch(batch.id, { rows: batch.inputs, revision: batch.result.revision }, active.key) : (await api.importResult(active.key)).receipt, active);
        invalidate(); if (!alive.current) return;
        setIntent({ ...active, counted: true }); setConfirmed(n => n + result.count); setProof(result); setProgress(`Đã xác nhận cập nhật phần ${i + 1}/${batches.length}: ${result.count} khách hàng.`);
        if (batches.slice(i + 1).some(b => b.result.ready > 0)) {
          // The explicit whole-file confirmation permits sequential parts.
          // Close only a proven part; an uncertain UUID always stays pending.
          await pendingWrites.complete(scope, operation, active.key); if (!alive.current) return; setIntent(null); setProof(null);
        }
      }
      if (alive.current) setDone(true);
    } catch (cause) { if (alive.current) { setError((cause as Error).message); setNeedsReview(true); invalidate(); } }
    finally { running.current = false; if (alive.current) setStage(''); }
  }
  async function resolve() {
    if (!api || !intent || running.current) return;
    running.current = true; setStage('Đang đối chiếu phần đã gửi'); setError('');
    try {
      const result = await api.resolveWrite(intent.key, intent.operation); if (!alive.current) return;
      if (result.status === 'committed') {
        const found = requireProof((await api.importResult(intent.key)).receipt, intent); invalidate(); if (!alive.current) return;
        if (!intent.counted) { setConfirmed(n => n + found.count); setIntent({ ...intent, counted: true }); } setProof(found); setNeedsReview(true); setProgress(`Đã đối chiếu phần đã gửi: ${found.count} khách hàng được cập nhật.`);
      } else {
        await pendingWrites.complete(scope, intent.operation, intent.key); if (!alive.current) return;
        setIntent(null); setProof(null); setNeedsReview(true); setProgress('Phần này chưa ghi; mã cũ đã khóa. Kiểm tra lại file để tiếp tục phần còn lại.'); await pending.refetch();
      }
    } catch (cause) { if (alive.current) setError((cause as Error).message); }
    finally { running.current = false; if (alive.current) setStage(''); }
  }
  async function acknowledge() {
    if (!intent || !proof || running.current) return;
    running.current = true; setStage('Đang xác nhận kết quả'); setError('');
    try {
      await pendingWrites.complete(scope, intent.operation, intent.key); if (!alive.current) return;
      if (done) { disablePrevention(); router.dismissTo('/(tabs)/customers'); }
      else { setIntent(null); setProof(null); setNeedsReview(true); setProgress('Giữ phần đã cập nhật. Kiểm tra lại file để đối chiếu và tiếp tục phần còn lại.'); await pending.refetch(); }
    } catch (cause) { if (alive.current) setError((cause as Error).message); }
    finally { running.current = false; if (alive.current) setStage(''); }
  }
  return <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: theme.background }}><Stack.Screen options={{ title: 'Khớp cơ sở từ Excel' }} /><FlatList<CustomerStoreRow> ref={list} data={intent ? [] : visible.slice((current - 1) * 25, current * 25)} keyExtractor={r => String(r.rowNumber)} contentContainerStyle={{ padding: 16, gap: 12 }}
    ListHeaderComponent={<View style={{ gap: 14, marginBottom: 8 }}>
      {!!error && <InlineError message={error} />}{!!progress && <Text accessibilityLiveRegion="polite" style={muted}>{progress}</Text>}{busy && <StateView title={stage} loading />}
      {confirmed > 0 && <Card><Text style={text}>Đã xác nhận cập nhật {confirmed} khách trong lượt thao tác này. Các phần đã ghi được giữ lại khi phần sau bị gián đoạn.</Text></Card>}
      {intent ? <Card style={{ gap: 12 }}><Text selectable style={muted}>Mã phần đã gửi: {intent.key}</Text>{proof ? <><Text accessibilityRole="header" style={{ ...text, fontSize: 21, fontWeight: '700' }}>{done ? 'Đã cập nhật các phần hợp lệ' : `Phần đã gửi cập nhật ${proof.count} khách`}</Text><Text style={muted}>Ghi nhận {dateTime(proof.recordedAt)}. {done ? 'Giữ nguyên dòng đã đúng cơ sở, bỏ qua dòng lỗi.' : 'Kiểm tra lại file trước khi tiếp tục các phần còn lại.'}</Text><Button label={done ? 'Đã xem kết quả, về danh sách khách' : 'Đã xem phần này, kiểm tra lại file'} loading={busy} onPress={() => void acknowledge()} /></> : <><Text style={text}>Chưa xác nhận được phần đã gửi. Đối chiếu mã gốc trước khi cập nhật tiếp.</Text><Button label="Đối chiếu phần cập nhật cơ sở" loading={busy} onPress={() => void resolve()} /></>}</Card> : <>
        {pending.isPending && <StateView title="Đang kiểm tra mã nhập chờ" loading />}{pending.isError && <StateView title="Chưa kiểm tra được mã nhập chờ" message={pending.error.message} retry={() => void pending.refetch()} />}{!!pending.data?.length && <Card style={{ gap: 10 }}><Text style={text}>Còn lần nhập Excel chưa đối chiếu. Hoàn tất mã gốc trước khi cập nhật tiếp.</Text><Button label="Mở đối chiếu trong Tài khoản" onPress={() => router.push('/(tabs)/account')} /><Button secondary label="Kiểm tra lại các mã nhập chờ" disabled={busy || pending.isFetching} onPress={() => void pending.refetch()} /></Card>}
        <Card style={{ gap: 10 }}><Text accessibilityRole="header" style={{ ...text, fontSize: 22, fontWeight: '700' }}>Căn cước → cơ sở khách hàng</Text><Text style={text}>File .xlsx tối đa 5 MB, gồm Căn cước và Cơ sở. File trên 1.000 dòng được đọc và kiểm tra theo từng phần.</Text><Text style={muted}>Đối chiếu trùng căn cước trên toàn file trước khi lưu phần đầu. Chỉ đổi cơ sở khách hàng; giữ thông tin cá nhân, hợp đồng và xe.</Text></Card>
        <Button secondary label="Tải mẫu Căn cước / Cơ sở" loading={download.busy} disabled={disabled} onPress={() => void download.run(signal => api!.storeMatchTemplate(signal))} />{!!download.error && <InlineError message={download.error} />}{!!download.message && <Text style={muted}>{download.message}</Text>}
        <Button label={file ? 'Chọn file khớp cơ sở khác' : 'Chọn file Căn cước / Cơ sở'} disabled={disabled || download.busy} onPress={() => void inspect()} />
        {file && <><Text style={text}>{file.name}</Text><Button secondary label="Kiểm tra lại file và phần còn lại" disabled={disabled || download.busy} onPress={() => void inspect(file)} /></>}
        {busy && stage !== 'Đang cập nhật từng phần' && <Button secondary label="Dừng kiểm tra, giữ file gốc" onPress={() => controller.current?.abort()} />}
        {!!batches.length && <><Card style={{ gap: 8 }}><Text accessibilityRole="header" style={{ ...text, fontSize: 20, fontWeight: '700' }}>Kiểm tra trước khi cập nhật</Text><Text style={text}>{rows.length} dòng · Cần cập nhật {ready} · Đã đúng {unchanged} · Lỗi {invalid}</Text><Text style={muted}>{batches.length} phần. Chỉ cập nhật dòng khớp đúng một khách hàng. Bỏ qua dòng lỗi, giữ nguyên dòng đã đúng cơ sở.</Text>{needsReview && <InlineError message="Cần kiểm tra lại đầy đủ file trước khi cập nhật tiếp." />}</Card><ChoiceField label="Lọc kết quả khớp cơ sở" value={filter} choices={[{ value: 'all', label: 'Tất cả dòng' }, { value: 'ready', label: 'Cần cập nhật' }, { value: 'unchanged', label: 'Đã đúng cơ sở' }, { value: 'invalid', label: 'Lỗi' }]} disabled={busy} onChange={v => { setFilter(v); setPage(1); }} /><Text style={muted}>{visible.length} kết quả · Trang {current}/{pages}</Text></>}
      </>}
    </View>}
    renderItem={({ item }) => <Card style={{ gap: 8 }}><Text accessibilityRole="header" style={{ ...text, fontSize: 18, fontWeight: '700' }}>Dòng {item.rowNumber} · {item.state === 'ready' ? 'Sẽ cập nhật' : item.state === 'unchanged' ? 'Đã đúng cơ sở' : 'Lỗi'}</Text><Text selectable style={text}>{item.customer_name || 'Chưa khớp khách'}{item.customer_id ? ` · #${item.customer_id}` : ''}</Text><Text selectable style={muted}>Căn cước: {item.values.id_card || 'Chưa có'}</Text><Text style={text}>Hiện tại: {item.previous_store_name || 'Chưa có cơ sở'}</Text><Text style={text}>Cơ sở sẽ lưu: {item.store_name || 'Chưa khớp'}</Text><Text selectable style={muted}>Trong Excel: {item.values.store || 'Chưa có'}</Text>{item.errors.map((e, i) => <Text key={i} style={text}>{e}</Text>)}</Card>}
    ListFooterComponent={!intent && pages > 1 ? <View style={{ flexDirection: 'row', gap: 12 }}><View style={{ flex: 1 }}><Button secondary label="Trang trước" disabled={busy || current <= 1} onPress={() => setPage(current - 1)} /></View><View style={{ flex: 1 }}><Button secondary label="Trang sau" disabled={busy || current >= pages} onPress={() => setPage(current + 1)} /></View></View> : undefined}
  />{!!batches.length && !intent && <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: theme.border }}><Button label={`Kiểm tra và cập nhật cơ sở cho ${ready} khách`} loading={busy} disabled={disabled || needsReview || !ready || download.busy} onPress={() => setConfirm(true)} /></View>}
  {confirm && <ConfirmEdit title="Cập nhật cơ sở khách hàng từ Excel?" message={`${file?.name}\nCập nhật ${ready} khách theo ${batches.length} phần. Giữ nguyên ${unchanged} dòng đã đúng, bỏ qua ${invalid} dòng lỗi.\n\nMỗi phần được kiểm tra lại trước khi ghi. Nếu bị gián đoạn, phần đã ghi được giữ; đối chiếu mã rồi kiểm tra lại file để tiếp tục phần còn lại.`} confirmLabel={`Xác nhận cập nhật ${ready} khách`} busy={busy} onCancel={() => setConfirm(false)} onConfirm={() => void save()} />}
  {exit && <ConfirmEdit title="Rời màn khớp cơ sở?" message="Nội dung kiểm tra trên màn sẽ mất. File gốc và các phần đã cập nhật vẫn được giữ. Có thể chọn lại file, kiểm tra để xác định phần còn lại." confirmLabel="Rời màn khớp cơ sở" busy={busy} onCancel={() => setExit(null)} onConfirm={() => { if (!busy) exit(); }} />}
  </SafeAreaView>;
}
