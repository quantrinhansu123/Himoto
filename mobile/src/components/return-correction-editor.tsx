import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, usePreventRemove } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { MobileReturnCorrectionInput, MobileReturnCorrectionProfile } from '../../../shared/mobile-return-corrections';
import type { MobileReturnRefund } from '../../../shared/mobile-return-settlement';
import { validDraftTime } from '@himoto/mobile-draft-validation';
import { useReturnCorrectionWrite } from '@/hooks/use-return-correction-write';
import { useSession } from '@/providers/session';
import { dateTime, money, useTheme } from '@/theme';
import { Button, Card, InlineError, StateView } from './ui';
import { ChoiceField, FormField } from './form-fields';
import { RentalDateTime } from './rental-date-time';
import { ConfirmEdit } from './editor-sheet';

const local = (stamp: string) => new Date(Date.parse(stamp) + 7 * 3600000).toISOString().slice(0, 16);
export function ReturnCorrectionEditor({ id }: { id: string }) {
  const [page, setPage] = useState(1), [anchor, setAnchor] = useState(''), [dirty, setDirty] = useState(false), [version, setVersion] = useState(0);
  const write = useReturnCorrectionWrite(id, page), { api, session } = useSession(), theme = useTheme(), scroll = useRef<ScrollViewInstance>(null);
  const [confirm, setConfirm] = useState<MobileReturnCorrectionInput | null>(null), [exit, setExit] = useState<(() => void) | null>(null), [switchTo, setSwitchTo] = useState(''), [reload, setReload] = useState(false);
  const disablePrevention = usePreventRemove(write.busy || dirty && !write.proof, ({ repeat }) => setExit(() => repeat));
  useEffect(() => { if (write.key || write.error) { scroll.current?.scrollTo({ y: 0, animated: false }); AccessibilityInfo.announceForAccessibility(write.error || 'Kiểm tra kết quả sửa trả xe.'); } }, [write.key, write.error]);
  const options = write.query.data?.options, itemId = anchor || String(options?.rows[0]?.itemId || '');
  const profile = useQuery({ queryKey: ['return-correction-profile', api?.origin, session?.user.id, session?.user.storeId, session?.user.allStores, id, itemId, version], queryFn: ({ signal }) => api!.returnCorrection(id, itemId, signal), enabled: !!api && !!itemId && !write.key && !write.query.isPending, retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const data = profile.data, disabled = write.busy || !!write.key || profile.isError || write.query.isError || write.query.isFetching;
  const text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  function acceptAnchor(value: string) { setAnchor(value); setDirty(false); setVersion(v => v + 1); }
  const choices = options?.rows.map(r => ({ value: String(r.itemId), label: `Lượt #${r.itemId} · ${r.license || r.name} · ${dateTime(r.returnedAt)}` })) || [];
  if (itemId && !choices.some(c => c.value === itemId)) choices.push({ value: itemId, label: `Lượt đã chọn #${itemId}` });
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
    <Stack.Screen options={{ title: 'Sửa hồ sơ / quyết toán xe đã trả' }} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 18, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center', paddingBottom: 36 }}>
        <Text accessibilityRole="header" style={{ ...text, fontSize: 24, lineHeight: 32, fontWeight: '800' }}>Sửa hồ sơ trả xe</Text>
        {!!(write.error || write.query.error) && <InlineError message={write.error || write.query.error?.message || 'Chưa mở được lượt trả.'} />}
        {!!write.notice && <Text accessibilityLiveRegion="polite" style={text}>{write.notice}</Text>}
        {write.query.isPending && <StateView title="Đang kiểm tra lượt trả và lần sửa trước" loading />}
        {write.query.isError && <><Button secondary label="Tải lại các lượt trả" disabled={write.busy} onPress={() => void write.query.refetch()} /><Button secondary label="Mở thao tác cần đối chiếu" onPress={() => router.push('/(tabs)/account')} /></>}
        {write.key && <Card style={{ gap: 14 }}>
          <Text accessibilityRole="header" style={{ ...text, fontSize: 20, fontWeight: '700' }}>{write.proof ? 'Đã ghi nhận sửa hồ sơ trả xe' : 'Cần đối chiếu lần sửa trước'}</Text><Text selectable style={muted}>Mã lần sửa: {write.key}</Text>
          {write.proof ? <><Text style={text}>Hợp đồng #{write.proof.receipt.id} · phiên bản ghi nhận {write.proof.receipt.revision}.</Text><Text style={muted}>Mở hợp đồng để xem hồ sơ hiện tại. Lịch sử giữ lần sửa và các phiếu đã thay thế.</Text><Button label="Đã kiểm tra, mở hợp đồng" loading={write.busy} onPress={() => void write.acknowledge(disablePrevention)} /></> : <><Text style={text}>Mở kết quả đã ghi hoặc khóa mã chưa ghi trước khi cho lưu lại.</Text><Button label="Đối chiếu sửa hồ sơ trả xe" loading={write.busy} onPress={() => void write.resolve()} /></>}
        </Card>}
        {options && !write.key && <>
          <Text style={text}>{options.code} · {options.total} lượt xe đã trả</Text>
          {choices.length > 0 && <ChoiceField label="Lượt trả cần chỉnh sửa" value={itemId} choices={choices} disabled={disabled} searchable onChange={v => { if (v === itemId) return; if (dirty) setSwitchTo(v); else acceptAnchor(v); }} />}
          {!options.rows.length && <Text style={muted}>Hợp đồng chưa có lượt xe đã trả để sửa.</Text>}
          <Text style={muted}>Trang {options.page}/{options.pages}. Chọn một xe sẽ mở toàn bộ nhóm xe và phiếu của cùng lượt trả.</Text>
          {options.pages > 1 && <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Button secondary label="Trang lượt trả trước" disabled={disabled || page <= 1} onPress={() => setPage(p => p - 1)} /></View><View style={{ flex: 1 }}><Button secondary label="Trang lượt trả tiếp" disabled={disabled || page >= options.pages} onPress={() => setPage(p => p + 1)} /></View></View>}
        </>}
        {itemId && profile.isPending && !write.key && <StateView title="Đang mở hồ sơ, nhóm xe và phiếu gốc" loading />}
        {profile.isError && !write.key && <><InlineError message={profile.error.message} /><Button secondary label="Tải lại hồ sơ lượt trả" onPress={() => void profile.refetch()} /></>}
        {data && <ReturnCorrectionForm key={`${data.anchorItemId}:${version}`} initial={data} disabled={disabled || !!data.blockedReason} onDirty={() => { setDirty(true); if (!anchor) setAnchor(itemId); }} onReview={setConfirm} />}
        {data && !write.key && <Button secondary label="Tải hồ sơ lượt trả mới nhất" disabled={write.busy || profile.isFetching} onPress={() => setReload(true)} />}
      </ScrollView>
    </KeyboardAvoidingView>
    {confirm && <ConfirmEdit title="Thay thế quyết toán lượt trả đã ghi?" message={`${data?.code || `Hợp đồng #${id}`}\n${confirm.items.map(i => `Xe / lượt #${i.item_id} · trả ${dateTime(i.returned_at)} · phí trễ ${money(Number(i.fee_override || 0))} · sửa ${money(Number(i.repair_fee || 0))} · giảm sớm ${money(Number(i.early_discount || 0))}`).join('\n')}\nCác khoản thu: ${money(confirm.settlement.receipts.reduce((sum, r) => sum + Number(r.amount), 0))}\nHoàn thuê: ${money(Number(confirm.settlement.rental_refund?.amount || 0))} · Hoàn cọc: ${money(Number(confirm.settlement.refund?.amount || 0))}\n\nPhiếu của lượt này sẽ bị hủy và thay bằng phiếu đúng. Giữ lịch sử trước–sau, kho hiện tại và các lượt thuê sau. Máy chủ đối chiếu lại số tiền, thời gian và lịch đóng tiền trước khi lưu.\nLý do: ${confirm.reason || 'Không nhập'}`} confirmLabel="Xác nhận sửa quyết toán lượt trả" busy={write.busy} onCancel={() => setConfirm(null)} onConfirm={() => { const input = confirm; setConfirm(null); void write.save(input); }} />}
    {!!switchTo && <ConfirmEdit title="Đổi sang lượt trả khác?" message="Nội dung chưa gửi của lượt đang sửa sẽ mất." confirmLabel="Mở lượt trả đã chọn" onCancel={() => setSwitchTo('')} onConfirm={() => { acceptAnchor(switchTo); setSwitchTo(''); }} />}
    {reload && <ConfirmEdit title="Tải lại hồ sơ trả xe mới nhất?" message="Thay nội dung đang sửa bằng số liệu xe và tiền mới nhất từ máy chủ." confirmLabel="Tải lại hồ sơ trả xe" onCancel={() => setReload(false)} onConfirm={() => { setReload(false); void profile.refetch().then(result => { if (result.data) { setDirty(false); setVersion(v => v + 1); } }); }} />}
    {exit && <ConfirmEdit title={write.busy ? 'Đang sửa quyết toán trả xe' : 'Rời màn sửa hồ sơ trả xe?'} message={write.busy ? 'Chờ máy chủ xác nhận trước khi rời.' : 'Nội dung chưa gửi sẽ mất. Mã đã gửi được giữ để đối chiếu trong Tài khoản.'} confirmLabel="Rời màn sửa hồ sơ trả xe" busy={write.busy} onCancel={() => setExit(null)} onConfirm={() => { if (!write.busy) exit(); }} />}
  </SafeAreaView>;
}
type Kind = 'late_fee' | 'repair_fee' | 'rental_debt' | 'refund' | 'rental_refund';
type Row = MobileReturnRefund & { key: number; kind: Kind };
const labels: Record<Kind, string> = { late_fee: 'Thu phí trễ', repair_fee: 'Thu phí sửa chữa', rental_debt: 'Thu công nợ thuê xe', refund: 'Hoàn cọc', rental_refund: 'Hoàn tiền thuê trả sớm' };
function ReturnCorrectionForm({ initial, disabled, onDirty, onReview }: { initial: MobileReturnCorrectionProfile; disabled: boolean; onDirty: () => void; onReview: (input: MobileReturnCorrectionInput) => void }) {
  const theme = useTheme(), [items, setItems] = useState<MobileReturnCorrectionInput['items']>(() => initial.lines.map(l => ({ item_id: l.id, item_revision: l.revision, returned_at: local(l.returnedAt), hourly_rate: String(l.hourlyRate), fee_override: String(l.lateFee), repair_fee: String(l.repairFee), early_discount: String(l.earlyDiscount), repair_note: l.repairNote })));
  const [rows, setRows] = useState<Row[]>(() => [...initial.settlement.receipts, ...(initial.settlement.refund ? [{ ...initial.settlement.refund, kind: 'refund' as const }] : []), ...(initial.settlement.rental_refund ? [{ ...initial.settlement.rental_refund, kind: 'rental_refund' as const }] : [])].map((r, i) => ({ ...r, key: i })));
  const [lineIndex, setLineIndex] = useState(0), [rowKey, setRowKey] = useState(rows[0]?.key ?? -1), [deferred, setDeferred] = useState(initial.settlement.refund_deferred === true), [recipient, setRecipient] = useState(() => ({ bank: initial.settlement.refund_recipient?.bank || '', account: initial.settlement.refund_recipient?.account || '', name: initial.settlement.refund_recipient?.name || '' }));
  const [note, setNote] = useState(initial.note), [reason, setReason] = useState(''), [error, setError] = useState('');
  const text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  const line = items[lineIndex], vehicle = initial.lines.find(l => l.id === line?.item_id), row = rows.find(r => r.key === rowKey);
  function change(task: () => void) { if (!disabled) { task(); onDirty(); setError(''); } }
  function updateLine(patch: Partial<typeof line>) { change(() => setItems(old => old.map((r, i) => i === lineIndex ? { ...r, ...patch } : r))); }
  function updateRow(patch: Partial<Row>) { change(() => setRows(old => old.map(r => r.key === rowKey ? { ...r, ...patch } : r))); }
  const adjustment = items.reduce((s, i) => s + Number(i.fee_override || 0) + Number(i.repair_fee || 0) - Number(i.early_discount || 0), 0);
  const estimatedTotal = initial.totalAmount === null ? null : initial.totalAmount - initial.previousAdjustment + adjustment;
  const income = rows.filter(r => !['refund', 'rental_refund'].includes(r.kind)).reduce((s, r) => s + Number(r.amount || 0), 0), rentalRefund = Number(rows.find(r => r.kind === 'rental_refund')?.amount || 0), depositRefund = Number(rows.find(r => r.kind === 'refund')?.amount || 0);
  const balance = estimatedTotal === null || initial.rentalPaid === null ? null : estimatedTotal - initial.rentalPaid - income + rentalRefund;
  function review() {
    Keyboard.dismiss();
    if (rows.some(r => !/^[1-9]\d{0,12}$/.test(r.amount) || !validDraftTime(r.paid_at) || !initial.accounts.some(a => a.method === r.method && a.id === r.account_id))) { setError('Nhập ngày giờ, số tiền dương và tài khoản / két đang hoạt động cho từng khoản thu/hoàn.'); return; }
    if (items.some(i => !validDraftTime(i.returned_at) || !/^\d{1,7}$/.test(i.hourly_rate) || [i.fee_override, i.repair_fee, i.early_discount].some(v => !/^\d{1,13}$/.test(v || '')))) { setError('Nhập ngày trả và số tiền nguyên VND cho từng xe, kể cả khoản bằng 0.'); return; }
    const payment = (r: Row, refund = false): MobileReturnRefund => ({ amount: r.amount, method: r.method, account_id: r.account_id, paid_at: r.paid_at, ...(refund && r.method !== 'cash' ? { ...(r.recipient_bank ? { recipient_bank: r.recipient_bank } : {}), ...(r.recipient_account ? { recipient_account: r.recipient_account } : {}), ...(r.recipient_name ? { recipient_name: r.recipient_name } : {}) } : {}) });
    const refund = rows.find(r => r.kind === 'refund'), rental = rows.find(r => r.kind === 'rental_refund');
    onReview({ item_id: initial.anchorItemId, revision: initial.revision, reason: reason.trim(), note, items, settlement: { revision: initial.settlement.revision,
      receipts: rows.filter(r => !['refund', 'rental_refund'].includes(r.kind)).map(r => ({ ...payment(r), kind: r.kind as 'late_fee' | 'repair_fee' | 'rental_debt' })), ...(refund ? { refund: payment(refund, true) } : {}), ...(rental ? { rental_refund: payment(rental, true) } : {}), ...(!refund && deferred ? { refund_deferred: true, refund_recipient: recipient } : {}) } });
  }
  return <>
    <Card style={{ gap: 12 }}><Text style={text}>{initial.code} · {initial.customer || 'Chưa nhập tên khách'}</Text><Text style={muted}>Sửa toàn bộ nhóm {items.length} xe của lượt đã chọn. Các phiếu thu/hoàn thuộc lượt này sẽ được thay thế; bằng chứng cũ được giữ.</Text>{!!initial.blockedReason && <InlineError message={initial.blockedReason} />}</Card>
    <ChoiceField label="Xe trong nhóm trả cần sửa" value={String(lineIndex)} choices={initial.lines.map((l, i) => ({ value: String(i), label: `${l.license || l.name} · lượt #${l.id}` }))} disabled={disabled} onChange={v => setLineIndex(Number(v))} />
    {line && vehicle && <Card style={{ gap: 16 }}>
      <Text accessibilityRole="header" style={{ ...text, fontSize: 20, fontWeight: '700' }}>{vehicle.license || vehicle.name}</Text><Text style={muted}>Hẹn trả: {dateTime(vehicle.scheduledReturnAt || '')}{vehicle.reconciled ? ' · ngày thu hồi cũ chưa được đối chiếu.' : ''}</Text>
      <RentalDateTime label="trả xe thực tế cần sửa" value={line.returned_at} disabled={disabled} onChange={returned_at => updateLine({ returned_at })} />
      <FormField label="Phí trễ thực tế (VND)" value={line.fee_override || ''} keyboardType="number-pad" maxLength={13} editable={!disabled} onChangeText={fee_override => updateLine({ fee_override })} />
      <FormField label="Phí sửa chữa thực tế (VND)" value={line.repair_fee || ''} keyboardType="number-pad" maxLength={13} editable={!disabled} onChangeText={repair_fee => updateLine({ repair_fee })} />
      <FormField label="Giảm tiền thuê trả sớm (VND)" value={line.early_discount || ''} keyboardType="number-pad" maxLength={13} editable={!disabled} onChangeText={early_discount => updateLine({ early_discount })} />
      <FormField label="Đơn giá trễ mỗi giờ (VND)" value={line.hourly_rate} keyboardType="number-pad" maxLength={7} editable={!disabled} onChangeText={hourly_rate => updateLine({ hourly_rate })} />
      <FormField label="Nội dung sửa chữa lượt trả" value={line.repair_note || ''} multiline maxLength={1000} editable={!disabled} onChangeText={repair_note => updateLine({ repair_note })} />
    </Card>}
    <Card style={{ gap: 16 }}>
      <Text accessibilityRole="header" style={{ ...text, fontSize: 20, fontWeight: '700' }}>Khoản thực thu / hoàn trong lượt ({rows.length})</Text>
      {rows.length > 0 && <ChoiceField label="Khoản thu / hoàn cần sửa" value={String(rowKey)} choices={rows.map((r, i) => ({ value: String(r.key), label: `Khoản ${i + 1} · ${labels[r.kind]} · ${money(Number(r.amount || 0))}` }))} disabled={disabled} onChange={v => setRowKey(Number(v))} />}
      {row && <>
        <ChoiceField label="Loại khoản thu / hoàn" value={row.kind} choices={Object.entries(labels).filter(([kind]) => !['refund', 'rental_refund'].includes(kind) || kind === row.kind || !rows.some(r => r.kind === kind)).map(([value, label]) => ({ value, label }))} disabled={disabled} onChange={v => updateRow({ kind: v as Kind })} />
        <FormField label="Số tiền thực tế khoản thu / hoàn (VND)" value={row.amount} keyboardType="number-pad" maxLength={13} editable={!disabled} onChangeText={amount => updateRow({ amount })} />
        <ChoiceField label="Hình thức khoản thu / hoàn" value={row.method} choices={[{ value: 'cash', label: 'Tiền mặt' }, { value: 'transfer', label: 'CK tài khoản cá nhân' }, { value: 'company_transfer', label: 'CK tài khoản công ty' }]} disabled={disabled} onChange={v => updateRow({ method: v as Row['method'], account_id: 0 })} />
        <ChoiceField label="Tài khoản / két khoản thu / hoàn" value={String(row.account_id || '')} searchable choices={[{ value: '', label: 'Chọn tài khoản / két' }, ...initial.accounts.filter(a => a.method === row.method).map(a => ({ value: String(a.id), label: a.label }))]} disabled={disabled} onChange={v => updateRow({ account_id: Number(v) })} />
        <RentalDateTime label="thực tế thu / hoàn khoản đang sửa" value={row.paid_at} disabled={disabled} onChange={paid_at => updateRow({ paid_at })} />
        {['refund', 'rental_refund'].includes(row.kind) && row.method !== 'cash' && <>
          <FormField label="Ngân hàng người nhận hoàn" value={row.recipient_bank || ''} maxLength={150} editable={!disabled} onChangeText={recipient_bank => updateRow({ recipient_bank })} />
          <FormField label="Số tài khoản người nhận hoàn" value={row.recipient_account || ''} maxLength={150} editable={!disabled} onChangeText={recipient_account => updateRow({ recipient_account })} />
          <FormField label="Tên người nhận hoàn" value={row.recipient_name || ''} maxLength={150} editable={!disabled} onChangeText={recipient_name => updateRow({ recipient_name })} />
        </>}
        <Button secondary label="Bỏ khoản thu / hoàn đang sửa" disabled={disabled} onPress={() => change(() => { const next = rows.filter(r => r.key !== rowKey); setRows(next); setRowKey(next[0]?.key ?? -1); })} />
      </>}
      {!rows.length && <Text style={muted}>Chưa có khoản thu / hoàn trong lượt này. Chỉ thêm tiền thực tế đã nhận hoặc hoàn.</Text>}
      <Button secondary label="Thêm khoản thực thu / hoàn trong lượt trả" disabled={disabled || rows.length >= 52} onPress={() => change(() => { const key = Math.max(-1, ...rows.map(r => r.key)) + 1, account = initial.accounts.find(a => a.method === 'cash'); setRows(old => [...old, { key, kind: 'rental_debt', amount: '', method: 'cash', account_id: account?.id || 0, paid_at: local(new Date().toISOString()) }]); setRowKey(key); })} />
    </Card>
    {!rows.some(r => r.kind === 'refund') && <Card style={{ gap: 16 }}><ChoiceField label="Chờ kế toán hoàn cọc" value={deferred ? 'yes' : 'no'} choices={[{ value: 'no', label: 'Không ghi chờ hoàn cọc' }, { value: 'yes', label: 'Chờ kế toán hoàn cọc' }]} disabled={disabled} onChange={v => change(() => setDeferred(v === 'yes'))} />{deferred && <><FormField label="Ngân hàng khách chờ hoàn cọc" value={recipient.bank} maxLength={150} editable={!disabled} onChangeText={bank => change(() => setRecipient(r => ({ ...r, bank })))} /><FormField label="Tài khoản khách chờ hoàn cọc" value={recipient.account} maxLength={150} editable={!disabled} onChangeText={account => change(() => setRecipient(r => ({ ...r, account })))} /><FormField label="Tên khách chờ hoàn cọc" value={recipient.name} maxLength={150} editable={!disabled} onChangeText={name => change(() => setRecipient(r => ({ ...r, name })))} /></>}</Card>}
    <Card style={{ gap: 10 }}><Text accessibilityRole="header" style={{ ...text, fontSize: 20, fontWeight: '700' }}>Đối chiếu dự kiến</Text><Text style={text}>Điều chỉnh phí: {money(adjustment)}</Text><Text style={text}>Tổng tiền thuê: {money(estimatedTotal)}</Text><Text style={text}>{balance !== null && balance < 0 ? 'Tiền thuê thu dư' : 'Tiền thuê còn thiếu'}: {money(balance === null ? null : Math.abs(balance))}</Text><Text style={text}>Cọc còn giữ: {money(initial.depositHeld - depositRefund)}</Text><Text style={muted}>{initial.billing ? 'Máy chủ đối chiếu lại lịch đóng tiền theo giờ trả mới khi lưu.' : 'Máy chủ kiểm lại số dư, nhóm xe và phiếu trước khi xác nhận kết quả.'}</Text></Card>
    <FormField label="Ghi chú lượt trả đã sửa" value={note} multiline maxLength={1000} editable={!disabled} onChangeText={v => change(() => setNote(v))} />
    <FormField label="Lý do sửa trả xe (không bắt buộc)" value={reason} multiline maxLength={1000} editable={!disabled} onChangeText={v => change(() => setReason(v))} />
    {!!error && <InlineError message={error} />}
    <Button label="Kiểm tra sửa quyết toán lượt trả" disabled={disabled} onPress={review} />
  </>;
}
