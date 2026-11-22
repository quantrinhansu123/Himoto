import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, usePreventRemove } from 'expo-router';
import type { MobileCorrectionKind, MobileReceiptCorrections, MobileReceiptCorrectionInput, MobileRenewalCorrections, MobileRenewalCorrectionInput, MobileRenewalCorrectionPeriod, MobileRenewalCorrectionReceipt, MobileCorrectionAccount, MobileReceiptSplit } from '../../../shared/mobile-contract-corrections';
import type { MobileCollectionMethod } from '@himoto/mobile-contract';
import { validDraftTime } from '@himoto/mobile-draft-validation';
import { addRentalDuration } from '../../../shared/rental-time';
import { DEFAULT_RENEWAL_HOURLY_RATE, renewalDurationUnits, renewalRateSuggestion } from '../../../shared/renewal-duration';
import { useContractCorrectionWrite } from '@/hooks/use-contract-correction-write';
import { dateTime, money, useTheme } from '@/theme';
import { Button, Card, InlineError, StateView } from './ui';
import { ChoiceField, FormField } from './form-fields';
import { RentalDateTime } from './rental-date-time';
import { ConfirmEdit } from './editor-sheet';

export function ContractCorrectionEditor({ id, kind }: { id: string; kind: MobileCorrectionKind }) {
  const write = useContractCorrectionWrite(id, kind), theme = useTheme(), scroll = useRef<ScrollViewInstance>(null);
  const [confirm, setConfirm] = useState<MobileReceiptCorrectionInput | MobileRenewalCorrectionInput | null>(null), [dirty, setDirty] = useState(false), [exit, setExit] = useState<(() => void) | null>(null), [reload, setReload] = useState(false), [formVersion, setFormVersion] = useState(0);
  const disablePrevention = usePreventRemove(write.busy || dirty && !write.proof, ({ repeat }) => setExit(() => repeat));
  useEffect(() => { if (write.key || write.error) { scroll.current?.scrollTo({ y: 0, animated: false }); AccessibilityInfo.announceForAccessibility(write.error || 'Kiểm tra kết quả sửa khoản thu.'); } }, [write.key, write.error]);
  const disabled = write.busy || !!write.key || write.query.isError, context = write.query.data?.context;
  const text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  const title = kind === 'receipts' ? 'Sửa cọc / khoản đã thu' : 'Sửa ngày / tiền thực thu gia hạn';
  let reviewDetails = '';
  if (confirm && 'deposit_amount' in confirm) {
    reviewDetails = `Cọc thỏa thuận: ${money(Number(confirm.deposit_amount))}\n` + confirm.receipts.filter(r => JSON.stringify(r.parts) !== JSON.stringify((context as MobileReceiptCorrections | null)?.receipts.find(old => old.id === r.id)?.parts)).map(r => `Phiếu #${r.id}: ${r.parts.map(p => `${money(Number(p.amount))} · ${methods.find(m => m.value === p.method)?.label} · ${p.account_id ? `tài khoản/két #${p.account_id}` : 'chưa phân bổ'}`).join(' + ')}`).join('\n');
  } else if (confirm) {
    const renewalCtx = context as MobileRenewalCorrections | null;
    if (confirm.renewal_version !== undefined) {
      const period = renewalCtx?.renewals?.find(p => p.version === confirm.renewal_version);
      const collectedLine = confirm.collected_amount
        ? `${money(Number(confirm.collected_amount))} (lập phiếu thu mới · ${dateTime(confirm.paid_at || '')})`
        : 'Chưa thu (chỉ sửa kỳ / phí gia hạn)';
      reviewDetails = `Kỳ gia hạn v${confirm.renewal_version} (chưa có phiếu thu)\nThực thu: ${collectedLine}\nPhí kỳ: ${money(confirm.amount === undefined ? period?.amount ?? null : Number(confirm.amount))}\nKỳ: ${dateTime(confirm.before_return_at || period?.beforeReturnAt || '')} → ${dateTime(confirm.return_at || period?.returnAt || '')}`;
    } else {
      const original = renewalCtx?.receipts.find(r => r.id === confirm.transaction_id);
      reviewDetails = `Phiếu #${confirm.transaction_id}\nThực thu: ${money(confirm.collected_amount === undefined ? original?.collectedAmount ?? null : Number(confirm.collected_amount))}\nNgày thu: ${dateTime(confirm.paid_at || original?.paidAt || '')}\nPhí kỳ: ${money(confirm.amount === undefined ? original?.amount ?? null : Number(confirm.amount))}\nKỳ: ${dateTime(confirm.before_return_at || original?.beforeReturnAt || '')} → ${dateTime(confirm.return_at || original?.returnAt || '')}`;
    }
  }
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
    <Stack.Screen options={{ title }} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 18, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center', paddingBottom: 36 }}>
        <Text accessibilityRole="header" style={{ ...text, fontSize: 24, lineHeight: 32, fontWeight: '800' }}>{title}</Text>
        {!!(write.error || write.query.error) && <InlineError message={write.error || write.query.error?.message || 'Chưa tải được khoản thu.'} />}
        {!!write.notice && <Text accessibilityLiveRegion="polite" style={text}>{write.notice}</Text>}
        {write.query.isPending && <StateView title="Đang đối chiếu khoản thu và lần sửa trước" loading />}
        {write.query.isError && <Button secondary label="Tải lại khoản thu" disabled={write.busy} onPress={() => void write.query.refetch()} />}
        {write.key && <Card style={{ gap: 14 }}>
          <Text accessibilityRole="header" style={{ ...text, fontSize: 20, fontWeight: '700' }}>{write.proof ? 'Đã ghi nhận sửa khoản thu' : 'Cần đối chiếu lần sửa trước'}</Text>
          <Text selectable style={muted}>Mã lần sửa: {write.key}</Text>
          {write.proof ? <><Text style={text}>Hợp đồng #{write.proof.receipt.id} · phiên bản ghi nhận {write.proof.receipt.revision}.</Text><Text style={muted}>Mở hợp đồng để xem số liệu hiện tại. Kết quả này xác nhận lần sửa gốc.</Text><Button label="Đã kiểm tra, mở hợp đồng" loading={write.busy} onPress={() => void write.acknowledge(disablePrevention)} /></> : <><Text style={text}>Đối chiếu để mở kết quả đã ghi hoặc khóa mã chưa được ghi trước khi lưu lại.</Text><Button label="Đối chiếu lần sửa khoản thu" loading={write.busy} onPress={() => void write.resolve()} /></>}
        </Card>}
        {context && kind === 'receipts' && <ReceiptCorrectionForm key={formVersion} initial={context as MobileReceiptCorrections} disabled={disabled} onDirty={() => setDirty(true)} onReview={setConfirm} />}
        {context && kind === 'renewal' && <RenewalCorrectionForm key={formVersion} initial={context as MobileRenewalCorrections} disabled={disabled} onDirty={() => setDirty(true)} onReview={setConfirm} />}
        {context && !write.key && <Button secondary label="Tải lại phiếu mới nhất trước khi sửa" disabled={disabled || write.query.isFetching} onPress={() => setReload(true)} />}
      </ScrollView>
    </KeyboardAvoidingView>
    {confirm && <ConfirmEdit title="Xác nhận sửa phiếu đã ghi?" message={`${context?.code || `Hợp đồng #${id}`}\n${reviewDetails}\nLý do: ${confirm.reason}\n\n${kind === 'receipts' ? 'Cọc và các khoản chia sẽ thay thế số liệu thực nhận của phiếu đang sửa. Ngày thu, loại phiếu và cơ sở cũ được giữ.' : 'Đối chiếu ngày thực hiện và số tiền thực tế đã thu riêng với phí và khoảng gia hạn. Tiền hợp đồng, tổng đã thu và hạn trả cập nhật theo các trường thay đổi.'}\n\nLịch sử trước–sau và người sửa được giữ. Tin Telegram đã gửi được giữ để đối chiếu.`} confirmLabel="Xác nhận sửa khoản thu" busy={write.busy} onCancel={() => setConfirm(null)} onConfirm={() => { const input = confirm; setConfirm(null); void write.save(input); }} />}
    {exit && <ConfirmEdit title={write.busy ? 'Đang sửa khoản thu' : 'Rời màn sửa khoản thu?'} message={write.busy ? 'Chờ máy chủ xác nhận trước khi rời.' : 'Nội dung chưa gửi sẽ mất. Mã đã gửi được giữ để đối chiếu trong Tài khoản.'} confirmLabel="Rời màn sửa khoản thu" busy={write.busy} onCancel={() => setExit(null)} onConfirm={() => { if (!write.busy) exit(); }} />}
    {reload && <ConfirmEdit title="Tải lại phiếu thu mới nhất?" message="Nội dung đang sửa sẽ thay bằng số liệu mới nhất trên máy chủ. Mã chưa đối chiếu phải được xử lý trước khi tải lại." confirmLabel="Tải lại phiếu thu" onCancel={() => setReload(false)} onConfirm={() => { setReload(false); void write.query.refetch().then(result => { if (result.data?.context) { setDirty(false); setFormVersion(v => v + 1); } }); }} />}
  </SafeAreaView>;
}
const methods = [{ value: 'cash', label: 'Tiền mặt' }, { value: 'transfer', label: 'CK tài khoản cá nhân' }, { value: 'company_transfer', label: 'CK tài khoản công ty' }];
function CorrectionRouting({ value, accounts, disabled, label, optional = false, onChange }: { value: { method: MobileCollectionMethod; account_id: number }; accounts: MobileCorrectionAccount[]; disabled: boolean; label: string; optional?: boolean; onChange: (value: { method: MobileCollectionMethod; account_id: number }) => void }) {
  const rows = accounts.filter(a => a.method === value.method), selected = rows.some(a => a.id === value.account_id);
  return <>
    <ChoiceField label={`Hình thức ${label}`} value={value.method} choices={methods} disabled={disabled} onChange={method => {
      const next = accounts.filter(a => a.method === method); onChange({ method: method as MobileCollectionMethod, account_id: next.length === 1 ? next[0].id : 0 });
    }} />
    <ChoiceField label={`Tài khoản / két ${label}`} value={String(value.account_id || '')} choices={[{ value: '', label: optional ? 'Chưa phân bổ tài khoản / két' : 'Chọn tài khoản / két nhận' }, ...rows.map(a => ({ value: String(a.id), label: a.label })), ...(!selected && value.account_id ? [{ value: String(value.account_id), label: `Tài khoản đã lưu #${value.account_id} (cần kiểm tra)` }] : [])]} disabled={disabled} searchable onChange={account => onChange({ ...value, account_id: Number(account) })} />
  </>;
}
function ReceiptCorrectionForm({ initial, disabled, onDirty, onReview }: { initial: MobileReceiptCorrections; disabled: boolean; onDirty: () => void; onReview: (input: MobileReceiptCorrectionInput) => void }) {
  const theme = useTheme(), [input, setInput] = useState<MobileReceiptCorrectionInput>(() => ({ revision: initial.revision, deposit_amount: initial.depositAmount, reason: '', receipts: initial.receipts.map(r => ({ ...r, parts: r.parts.map(p => ({ ...p })) })) }));
  const [selected, setSelected] = useState(String(initial.receipts[0]?.id || '')), [error, setError] = useState('');
  const row = input.receipts.find(r => String(r.id) === selected), text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  function change(next: MobileReceiptCorrectionInput) { if (!disabled) { setInput(next); setError(''); onDirty(); } }
  function parts(next: MobileReceiptSplit[]) { if (row) change({ ...input, receipts: input.receipts.map(r => r.id === row.id ? { ...r, parts: next } : r) }); }
  const sums = input.receipts.reduce((s, r) => { for (const p of r.parts) { const n = Number(p.amount) || 0; s[r.deposit ? 'deposit' : 'rental'] += n; s[p.method === 'cash' ? 'cash' : 'transfer'] += n; } return s; }, { deposit: 0, rental: 0, cash: 0, transfer: 0 });
  function review() {
    Keyboard.dismiss(); if (!input.reason.trim()) { setError('Nhập lý do sửa khoản thu.'); return; }
    if (!/^(0|[1-9]\d{0,12})$/.test(input.deposit_amount) || input.receipts.some(r => r.parts.some(p => !/^\d{0,13}$/.test(p.amount)))) { setError('Nhập số tiền nguyên VND hợp lệ trước khi kiểm tra.'); return; }
    const receipts = input.receipts.map(r => { const positive = r.parts.filter(p => Number(p.amount) > 0); return { ...r, parts: positive.length ? positive : [{ ...r.parts[0], amount: '0' }] }; });
    onReview({ ...input, reason: input.reason.trim(), receipts });
  }
  return <>
    <Card style={{ gap: 12 }}><Text style={text}>{initial.code}</Text><Text style={muted}>Sửa số tiền khách đã thực tế thanh toán trên phiếu cũ. Ngày thu cũ được giữ; phiếu gia hạn, thu khác và hoàn tiền xử lý riêng.</Text><FormField label="Tiền cọc thỏa thuận (VND)" value={input.deposit_amount} keyboardType="number-pad" editable={!disabled} maxLength={13} onChangeText={v => change({ ...input, deposit_amount: v })} /></Card>
    {input.receipts.length > 0 ? <>
      <ChoiceField label="Phiếu thu cần sửa" value={selected} choices={input.receipts.map(r => ({ value: String(r.id), label: `#${r.id} · ${r.deposit ? 'Tiền cọc' : 'Tiền thuê'} · ${dateTime(r.paid_at)}` }))} disabled={disabled} searchable onChange={setSelected} />
      {row && <Card style={{ gap: 16 }}><Text accessibilityRole="header" style={{ ...text, fontSize: 20, fontWeight: '700' }}>Phiếu #{row.id} · {row.deposit ? 'Tiền cọc' : 'Tiền thuê'}</Text><Text style={muted}>Ngày thu giữ nguyên: {dateTime(row.paid_at)}</Text>
        {row.parts.map((p, i) => <View key={i} style={{ gap: 12, borderTopWidth: i ? 1 : 0, borderTopColor: theme.border, paddingTop: i ? 16 : 0 }}>
          <FormField label={`Số tiền phiếu ${row.id} khoản ${i + 1}`} value={p.amount} keyboardType="number-pad" maxLength={13} editable={!disabled} onChangeText={v => parts(row.parts.map((part, j) => j === i ? { ...part, amount: v } : part))} hint={money(Number(p.amount || 0))} />
          <CorrectionRouting label={`phiếu ${row.id} khoản ${i + 1}`} value={p} accounts={initial.accounts} disabled={disabled} optional onChange={next => parts(row.parts.map((part, j) => j === i ? { ...part, ...next } : part))} />
          {row.parts.length > 1 && <Button secondary label={`Bỏ khoản ${i + 1} của phiếu ${row.id}`} disabled={disabled} onPress={() => parts(row.parts.filter((_, j) => j !== i))} />}
        </View>)}
        <Button secondary label="Tách thêm khoản tiền mặt / chuyển khoản" disabled={disabled || row.parts.length >= 10} onPress={() => parts([...row.parts, { amount: '', method: 'cash', account_id: 0 }])} />
        <Text style={muted}>Có thể giữ khoản chưa phân bổ tài khoản/két. Dòng trống hoặc bằng 0 được bỏ khỏi tổng khi còn dòng dương.</Text>
      </Card>}
    </> : <Card><Text style={text}>Chưa có phiếu thu cọc / tiền thuê thông thường để sửa.</Text></Card>}
    <Card style={{ gap: 10 }}><Text accessibilityLiveRegion="polite" style={text}>Cọc đã thu: {money(sums.deposit)} · Thuê đã thu: {money(sums.rental)}</Text><Text style={text}>Tiền mặt: {money(sums.cash)} · Chuyển khoản: {money(sums.transfer)}</Text><Text style={muted}>Tổng của {input.receipts.length} phiếu đang sửa; giữ lựa chọn và nội dung khi đổi phiếu.</Text></Card>
    <FormField label="Lý do sửa khoản thu" value={input.reason} multiline maxLength={500} editable={!disabled} onChangeText={reason => change({ ...input, reason })} />
    {!!error && <InlineError message={error} />}
    <Button label="Kiểm tra sửa cọc / khoản thu" disabled={disabled} onPress={review} />
  </>;
}
const localTime = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 16) : '';
const nowLocalTime = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16);
function RenewalCorrectionForm({ initial, disabled, onDirty, onReview }: { initial: MobileRenewalCorrections; disabled: boolean; onDirty: () => void; onReview: (input: MobileRenewalCorrectionInput) => void }) {
  const theme = useTheme();
  const periods = initial.renewals || [];
  const defaultTarget = initial.receipts.find(r => r.status === 'approved')
    ? `receipt:${initial.receipts.find(r => r.status === 'approved')!.id}`
    : periods[0]
      ? `version:${periods[0].version}`
      : initial.receipts[0]
        ? `receipt:${initial.receipts[0].id}`
        : '';
  const [selected, setSelected] = useState(defaultTarget);
  const [calcUnit, setCalcUnit] = useState<'day' | 'hour'>('day');
  const [calcRate, setCalcRate] = useState('');
  const [countDraft, setCountDraft] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, { method: MobileCollectionMethod; account_id: number; paidAt: string; collected: string; before: string; end: string; amount: string; reason: string }>>({}), [error, setError] = useState('');
  const receipt = selected.startsWith('receipt:') ? initial.receipts.find(r => `receipt:${r.id}` === selected) : undefined;
  const renewal: MobileRenewalCorrectionPeriod | undefined = selected.startsWith('version:') ? periods.find(p => `version:${p.version}` === selected) : undefined;
  const text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  function defaultsForReceipt(r: MobileRenewalCorrectionReceipt) { return { method: r.method || 'cash' as const, account_id: r.accountId || 0, paidAt: localTime(r.paidAt), collected: String(r.collectedAmount), before: localTime(r.beforeReturnAt), end: localTime(r.returnAt), amount: String(r.amount ?? r.collectedAmount), reason: '' }; }
  function defaultsForPeriod(p: MobileRenewalCorrectionPeriod) {
    const cashAccounts = initial.accounts.filter(a => a.method === 'cash');
    return { method: 'cash' as const, account_id: cashAccounts.length === 1 ? cashAccounts[0].id : 0, paidAt: nowLocalTime(), collected: '', before: localTime(p.beforeReturnAt), end: localTime(p.returnAt), amount: String(p.amount), reason: '' };
  }
  const form = receipt ? forms[selected] || defaultsForReceipt(receipt) : renewal ? forms[selected] || defaultsForPeriod(renewal) : null;
  const collecting = Boolean(receipt || (form && Number(form.collected) > 0));
  const feeEditable = receipt ? receipt.feeEditable : renewal ? renewal.feeEditable : false;
  function change(next: NonNullable<typeof form>) { if (!disabled) { setForms(current => ({ ...current, [selected]: next })); onDirty(); setError(''); } }
  function review() {
    Keyboard.dismiss(); if ((!receipt && !renewal) || !form) return;
    if (!form.reason.trim()) { setError('Nhập lý do sửa thanh toán / thời gian gia hạn.'); return; }
    if (collecting && (!form.account_id || !initial.accounts.some(a => a.method === form.method && a.id === form.account_id))) { setError('Chọn tài khoản / két nhận đang hoạt động.'); return; }
    if (collecting && (!validDraftTime(form.paidAt) || !/^[1-9]\d{0,12}$/.test(form.collected))) { setError('Nhập ngày thực hiện hợp lệ và số tiền thực tế đã thu lớn hơn 0.'); return; }
    if (renewal && form.collected && !/^(0|[1-9]\d{0,12})$/.test(form.collected)) { setError('Số tiền thực tế đã thu phải là số nguyên VND không âm.'); return; }
    if (renewal && Number(form.collected) > Number(form.amount)) { setError('Số tiền đã thu không được vượt phí gia hạn của kỳ.'); return; }
    if (feeEditable && !/^(0|[1-9]\d{0,12})$/.test(form.amount)) { setError('Phí gia hạn phải là số nguyên VND không âm.'); return; }
    if (form.before && form.end && validDraftTime(form.before) && validDraftTime(form.end) && Date.parse(`${form.end}:00+07:00`) <= Date.parse(`${form.before}:00+07:00`)) {
      setError('Thời gian kết thúc gia hạn phải sau thời gian bắt đầu.'); return;
    }
    const input: MobileRenewalCorrectionInput = receipt
      ? { transaction_id: receipt.id, revision: receipt.revision, method: form.method, account_id: form.account_id, reason: form.reason.trim() }
      : { renewal_version: renewal!.version, revision: initial.revision, reason: form.reason.trim(), ...(collecting ? { method: form.method, account_id: form.account_id } : {}) };
    const origBefore = receipt ? receipt.beforeReturnAt : renewal!.beforeReturnAt;
    const origEnd = receipt ? receipt.returnAt : renewal!.returnAt;
    const origPaidAt = receipt ? receipt.paidAt : null;
    for (const [field, original, next, active] of [
      ['paid_at', origPaidAt, form.paidAt, collecting],
      ['before_return_at', origBefore, form.before, true],
      ['return_at', origEnd, form.end, true],
    ] as const) {
      if (!active) continue;
      if (original && next === localTime(original)) continue;
      if (!next && !original) continue;
      if (!validDraftTime(next)) { setError('Nhập đủ ngày giờ hợp lệ theo giờ Việt Nam.'); return; }
      input[field] = new Date(`${next}:00+07:00`).toISOString();
    }
    // Preserve original sub-minute timestamps whenever a date was not edited.
    if (receipt && form.collected !== String(receipt.collectedAmount)) input.collected_amount = form.collected;
    if (renewal && collecting) input.collected_amount = form.collected;
    const origAmount = receipt ? (receipt.amount ?? receipt.collectedAmount) : renewal!.amount;
    if (feeEditable && form.amount !== String(origAmount)) input.amount = form.amount;
    onReview(input);
  }
  const targetChoices = [
    ...initial.receipts.map(r => ({ value: `receipt:${r.id}`, label: `#${r.id} · ${money(r.collectedAmount)} · ${r.status === 'cancelled' ? 'Đã hủy' : r.license || 'Gia hạn nhiều xe'}` })),
    ...periods.map(p => ({ value: `version:${p.version}`, label: `Kỳ gia hạn v${p.version} (chưa có phiếu thu) · Phí ${money(p.amount)}` })),
  ];
  return <>
    <Card style={{ gap: 12 }}><Text style={text}>{initial.code}</Text><Text style={text}>Giá trị hợp đồng: {money(initial.totalAmount)} · Thuê đã thu: {money(initial.rentalPaid)}</Text><Text style={muted}>Ngày thực hiện và tiền thực thu thuộc phiếu. Khoảng gia hạn và phí gia hạn là số liệu riêng. Có thể sửa cả kỳ gia hạn chưa có phiếu thu hoặc lập phiếu thu kèm theo.</Text></Card>
    {targetChoices.length ? <ChoiceField label="Phiếu / kỳ gia hạn cần sửa" value={selected} choices={targetChoices} disabled={disabled} searchable onChange={v => { setSelected(v); setError(''); }} /> : <Card><Text style={text}>Chưa có kỳ gia hạn hoặc phiếu gia hạn để sửa trong hợp đồng.</Text></Card>}
    {(receipt || renewal) && form && <>
      <Card style={{ gap: 16 }}>
        <Text accessibilityRole="header" style={{ ...text, fontSize: 20, fontWeight: '700' }}>
          {receipt ? `Phiếu #${receipt.id} · ${receipt.license || receipt.vehicleName || 'Gia hạn nhiều xe'}` : `Kỳ gia hạn v${renewal!.version} · Chưa có phiếu thu`}
        </Text>
        {renewal && <Text style={muted}>Kỳ này chưa có phiếu thu. Nhập số tiền thực tế đã thu để lập phiếu, hoặc để trống nếu khách chưa thanh toán.</Text>}
        {collecting && <RentalDateTime label="thực hiện khoản thu" value={form.paidAt} disabled={disabled || receipt?.status === 'cancelled'} onChange={paidAt => change({ ...form, paidAt })} />}
        <FormField label="Số tiền thực tế đã thu (VND)" value={form.collected} keyboardType="number-pad" editable={!disabled && (!receipt || receipt.status === 'approved')} maxLength={13} onChangeText={collected => change({ ...form, collected: collected.replace(/\D/g, '') })} hint={form.collected ? money(Number(form.collected || 0)) : 'Để trống nếu khách chưa thanh toán'} />
        {collecting && <CorrectionRouting label={receipt ? `phiếu gia hạn ${receipt.id}` : `kỳ gia hạn v${renewal!.version}`} value={form} accounts={initial.accounts} disabled={disabled} onChange={routing => change({ ...form, ...routing })} />}
        <RentalDateTime label="bắt đầu kỳ gia hạn" value={form.before} disabled={disabled} onChange={before => { setCountDraft(null); change({ ...form, before }); }} />
        <RentalDateTime label="kết thúc kỳ gia hạn" value={form.end} disabled={disabled} onChange={end => { setCountDraft(null); change({ ...form, end }); }} />
        {feeEditable && !!form.before && validDraftTime(form.before) && (
          <View style={{ padding: 12, borderRadius: 10, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, gap: 10 }}>
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>Tính nhanh thời lượng & phí gia hạn</Text>
            <ChoiceField label="Đơn vị tính" value={calcUnit} choices={[{ value: 'day', label: 'Theo ngày' }, { value: 'hour', label: 'Theo giờ' }]} disabled={disabled} onChange={v => {
              const nextUnit = v as 'day' | 'hour';
              setCalcUnit(nextUnit);
              setCountDraft(null);
              if (nextUnit === 'hour' && !calcRate) setCalcRate(DEFAULT_RENEWAL_HOURLY_RATE);
            }} />
            <FormField
              label={calcUnit === 'day' ? 'Số ngày gia hạn' : 'Số giờ gia hạn'}
              value={countDraft ?? String(renewalDurationUnits(new Date(`${form.before}:00+07:00`).toISOString(), form.end || '', calcUnit) || '')}
              keyboardType="number-pad"
              maxLength={3}
              editable={!disabled}
              onChangeText={countText => {
                const cleaned = countText.replace(/\D/g, '');
                setCountDraft(cleaned);
                const count = Number(cleaned);
                if (!count || count < 1) return;
                const beforeIso = new Date(`${form.before}:00+07:00`).toISOString();
                const nextEnd = addRentalDuration(beforeIso, count, calcUnit);
                const suggested = calcRate ? renewalRateSuggestion(beforeIso, nextEnd, calcRate, calcUnit) : null;
                setCountDraft(null);
                change({ ...form, end: nextEnd, ...(suggested !== null ? { amount: String(suggested) } : {}) });
              }}
            />
            <FormField
              label={calcUnit === 'day' ? 'Đơn giá ngày để tính gợi ý (VND)' : 'Đơn giá giờ để tính gợi ý (VND)'}
              value={calcRate}
              keyboardType="number-pad"
              maxLength={10}
              editable={!disabled}
              onChangeText={rateText => {
                const cleaned = rateText.replace(/\D/g, '');
                setCalcRate(cleaned);
                const beforeIso = new Date(`${form.before}:00+07:00`).toISOString();
                const suggested = cleaned ? renewalRateSuggestion(beforeIso, form.end, cleaned, calcUnit) : null;
                if (suggested !== null) change({ ...form, amount: String(suggested) });
              }}
            />
          </View>
        )}
        <FormField label="Phí gia hạn của kỳ (VND)" value={form.amount} keyboardType="number-pad" maxLength={13} editable={!disabled && feeEditable} onChangeText={amount => change({ ...form, amount: amount.replace(/\D/g, '') })} hint={feeEditable ? 'Phí hợp đồng của kỳ, khác với số thực thu trên phiếu.' : 'Kỳ này không cho sửa phí tại đây (phiếu đã hủy, xe đã trả hoặc hợp đồng đã chốt).'} />
        {receipt?.status === 'cancelled' && <Text style={muted}>Phiếu đã hủy giữ nguyên ngày và tiền thực thu; chỉ chỉnh thông tin gia hạn/hình thức theo điều kiện cho phép.</Text>}
      </Card>
      <FormField label="Lý do sửa gia hạn / khoản thu" value={form.reason} multiline maxLength={500} editable={!disabled} onChangeText={reason => change({ ...form, reason })} />
      {!!error && <InlineError message={error} />}
      <Button label={renewal ? (collecting ? 'Kiểm tra lưu kỳ gia hạn và lập phiếu thu' : 'Kiểm tra sửa kỳ gia hạn') : 'Kiểm tra sửa ngày / tiền thực thu gia hạn'} disabled={disabled} onPress={review} />
    </>}
  </>;
}
