import { KeyboardFormScrollView } from "./keyboard-form-scroll-view";
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, RefreshControl, Text, View, type ScrollViewInstance } from 'react-native';
import { router } from 'expo-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RefundQrReader } from './refund-qr-reader';
import { mergeMobileRefundRecipient } from '../../../shared/mobile-refund-qr';
import type { MobileReturnPreview, MobileReturnPreviewInput } from '../../../shared/mobile-returns';
import type { MobileReturnSettlementInput, MobileReturnSettlementPreview } from '../../../shared/mobile-return-settlement';
import { useSession } from '@/providers/session';
import { useReturnWrite } from '@/hooks/use-return-write';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import {
  earlyEstimateText,
  emptyReturnMoney,
  estimateReturnLine,
  lateEstimateText,
  newReturnLine,
  returnFeeInput,
  returnLocalTime,
  returnSettlementInput,
  syncReturnLineTiming,
  type ReturnLineDraft,
  type ReturnMoneyDraft,
  type ReturnReceiptDraft,
} from '@/lib/return-form';
import { dateTime, money, useTheme } from '@/theme';
import { Button, Card, InfoBanner, InlineError, KeyValueRow, StateView } from './ui';
import { FormField, ChoiceField } from './form-fields';
import { RentalDateTime } from './rental-date-time';
import { ConfirmEdit } from './editor-sheet';

const methods = [
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'transfer', label: 'CK tài khoản cá nhân' },
  { value: 'company_transfer', label: 'CK tài khoản công ty' },
];
const kinds = [
  { value: 'late_fee', label: 'Đã thu phí quá hạn' },
  { value: 'repair_fee', label: 'Đã thu tiền sửa chữa' },
  { value: 'rental_debt', label: 'Đã thu công nợ thuê xe' },
];
const quickCollectionDefs: { kind: ReturnReceiptDraft['kind']; title: string; toggleLabel: string }[] = [
  { kind: 'late_fee', title: 'Phí quá hạn', toggleLabel: 'Đã thu phí quá hạn' },
  { kind: 'repair_fee', title: 'Phí sửa chữa', toggleLabel: 'Đã thu tiền sửa chữa' },
  { kind: 'rental_debt', title: 'Công nợ tiền thuê', toggleLabel: 'Đã thu công nợ thuê xe' },
];

export function ReturnEditor({ id }: { id: string }) {
  const { session, api } = useSession();
  if (!api || !session || !/^[1-9]\d{0,14}$/.test(id) || !session.user.permissions.includes('contracts.read') || !session.user.permissions.includes('contracts.return'))
    return <StateView title="Không mở được trả xe" message="Tài khoản cần quyền xem hợp đồng và trả/đổi xe." />;
  return <ReturnForm key={[api.origin, session.token, session.user.storeId, session.user.allStores, session.user.permissions.join(','), id].join(':')} id={id} />;
}

function ReturnForm({ id }: { id: string }) {
  const { api, session } = useSession(), theme = useTheme(), reducedMotion = useReducedMotion(), scroll = useRef<ScrollViewInstance>(null);
  const [page, setPage] = useState(1), [step, setStep] = useState(0), [lines, setLines] = useState<ReturnLineDraft[]>([]), [lineIndex, setLineIndex] = useState(0);
  const [fees, setFees] = useState<MobileReturnPreview | null>(null), [feeInput, setFeeInput] = useState<MobileReturnPreviewInput | null>(null);
  const [receipts, setReceipts] = useState<ReturnReceiptDraft[]>([]), [receiptIndex, setReceiptIndex] = useState(0);
  const [rentalRefund, setRentalRefund] = useState<ReturnMoneyDraft | null>(null), [depositRefund, setDepositRefund] = useState<ReturnMoneyDraft | null>(null);
  const [deferredRecipient, setDeferredRecipient] = useState({ bank: '', recipientAccount: '', recipientName: '' });
  const [review, setReview] = useState<MobileReturnSettlementPreview | null>(null), [reviewInput, setReviewInput] = useState<MobileReturnSettlementInput | null>(null);
  const [previewing, setPreviewing] = useState(false), [error, setError] = useState(''), [confirm, setConfirm] = useState(false), [resolving, setResolving] = useState(false);
  const alive = useRef(true), running = useRef(false), abort = useRef<AbortController | null>(null);
  const action = useReturnWrite(id, lines.length > 0 || receipts.length > 0 || !!rentalRefund || !!depositRefund);
  const query = useQuery({
    queryKey: ['return-preparation', session?.user.id, session?.user.storeId, session?.user.allStores, id, page],
    queryFn: ({ signal }) => api!.returnPreparation(id, page, signal), enabled: !!api && action.checked && !action.key, placeholderData: keepPreviousData,
    staleTime: 30_000, gcTime: 300_000, refetchOnWindowFocus: false, refetchOnReconnect: false
  });
  const data = query.data, locked = previewing || action.busy || !action.checked || !!action.key;
  const [qrPending, setQrPending] = useState<Record<string, boolean>>({});
  useEffect(() => { alive.current = true; return () => { alive.current = false; abort.current?.abort(); }; }, []);
  const top = () => { Keyboard.dismiss(); scroll.current?.scrollTo({ y: 0, animated: !reducedMotion }); };
  function clearReview() { setReview(null); setReviewInput(null); setError(''); }
  function editLine(patch: Partial<ReturnLineDraft>) {
    if (locked) return;
    setLines(rows => rows.map((row, i) => i === lineIndex ? { ...row, ...patch } : row));
    setFees(null); setFeeInput(null); clearReview();
  }
  function changeReturnedAt(nextReturnedAt: string) {
    if (locked) return;
    setLines(rows => rows.map((row, i) => i === lineIndex ? syncReturnLineTiming(row, nextReturnedAt, Boolean(data?.ownership)) : row));
    setFees(null); setFeeInput(null); clearReview();
  }
  function defaultMoney(suggestedAmount = '', preferTransfer = false): ReturnMoneyDraft {
    const preferredMethod: ReturnMoneyDraft['method'] = preferTransfer
      ? (data?.accounts.some(row => row.method === 'transfer') ? 'transfer' : 'cash')
      : (data?.accounts.some(row => row.method === 'cash') ? 'cash' : 'transfer');
    const first = data?.accounts.find(row => row.method === preferredMethod) ?? data?.accounts[0];
    return {
      ...emptyReturnMoney(),
      amount: suggestedAmount,
      method: (first?.method ?? preferredMethod) as ReturnMoneyDraft['method'],
      account: String(first?.id ?? ''),
    };
  }
  function toggleQuickReceipt(kind: ReturnReceiptDraft['kind'], suggestedAmount: number) {
    if (locked) return;
    const existingIdx = receipts.findIndex(r => r.kind === kind);
    if (existingIdx >= 0) {
      setReceipts(old => old.filter((_, idx) => idx !== existingIdx));
      setReceiptIndex(0);
    } else {
      const next: ReturnReceiptDraft = {
        ...defaultMoney(suggestedAmount > 0 ? String(suggestedAmount) : '', true),
        kind,
      };
      setReceipts(old => [...old, next]);
      setReceiptIndex(receipts.length);
    }
    clearReview();
  }
  async function calculateFees() {
    if (!api || !data || locked || running.current) return;
    Keyboard.dismiss(); setError('');
    try {
      const input = returnFeeInput(data, lines); running.current = true; setPreviewing(true); abort.current = new AbortController();
      const result = await api.returnPreview(id, input, abort.current.signal); if (!alive.current) return;
      setFees(result); setFeeInput(input); clearReview(); setStep(2); top();
    } catch (cause) { if (alive.current) { setError((cause as Error).message); top(); } }
    finally { running.current = false; if (alive.current) setPreviewing(false); }
  }
  async function calculateSettlement(acknowledged = false) {
    if (!api || !data || !fees || !feeInput || locked || running.current) return;
    if (Object.values(qrPending).some(Boolean)) { setError('Còn ảnh QR chưa lưu. Lưu hoặc bỏ ảnh chưa gửi ở phần người nhận trước khi rà soát quyết toán.'); top(); return; }
    Keyboard.dismiss(); setError('');
    try {
      const input = returnSettlementInput(data, fees, feeInput, receipts, rentalRefund, depositRefund, acknowledged, Date.now(), deferredRecipient);
      running.current = true; setPreviewing(true); abort.current = new AbortController();
      const result = await api.returnSettlementPreview(id, input, abort.current.signal); if (!alive.current) return;
      setReview(result); setReviewInput(input); setStep(3); top();
    } catch (cause) { if (alive.current) { setError((cause as Error).message); top(); } }
    finally { running.current = false; if (alive.current) setPreviewing(false); }
  }
  const selected = lines[lineIndex];
  const estimate = selected ? estimateReturnLine(selected.vehicle, selected.returnedAt, selected.hourlyRate) : null;
  const suggestedLate = fees ? fees.items.reduce((sum, item) => sum + item.lateFee, 0) : 0;
  const suggestedRepair = fees ? fees.items.reduce((sum, item) => sum + item.repairFee, 0) : 0;
  const suggestedDebt = fees ? Math.max((fees.after.rentalRemaining ?? 0) - suggestedLate - suggestedRepair, 0) : 0;
  const suggestedByKind: Record<ReturnReceiptDraft['kind'], number> = {
    late_fee: suggestedLate,
    repair_fee: suggestedRepair,
    rental_debt: suggestedDebt,
  };
  const collectedTotal = receipts.reduce((sum, row) => sum + (/^\d+$/.test(row.amount || '') ? Number(row.amount) : 0), 0);
  const outstandingAfterReceipts = fees && fees.after.rentalRemaining !== null
    ? Math.max(fees.after.rentalRemaining - collectedTotal, 0)
    : null;

  function moneyFields(value: ReturnMoneyDraft, onChange: (next: ReturnMoneyDraft) => void, label: string, refund = false) {
    const change = (patch: Partial<ReturnMoneyDraft>) => { onChange({ ...value, ...patch }); clearReview(); };
    return <View style={{ gap: 14 }}>
      <FormField label="Số tiền thực tế (VNĐ)" value={value.amount} onChangeText={amount => change({ amount })} keyboardType="number-pad" editable={!locked} maxLength={13} />
      <ChoiceField label={refund ? 'Hình thức hoàn' : 'Hình thức thu'} value={value.method} choices={methods} disabled={locked} onChange={method => {
        const first = data?.accounts.find(row => row.method === method);
        change({ method: method as ReturnMoneyDraft['method'], account: first ? String(first.id) : '' });
      }} />
      <ChoiceField label={refund ? 'Tài khoản / két chi hoàn' : 'Tài khoản / két nhận tiền'} value={value.account} disabled={locked} choices={(data?.accounts ?? []).filter(row => row.method === value.method).map(row => ({ value: String(row.id), label: row.label }))} onChange={account => change({ account })} />
      <RentalDateTime label="thời điểm thực tế thu / hoàn" value={value.paidAt} disabled={locked} onChange={paidAt => change({ paidAt })} />
      {refund && value.method !== 'cash' && <>
        {lines[0] && <RefundQrReader id={id} itemId={lines[0].vehicle.id} value={value} onPendingChange={pending => setQrPending(old => old[label] === pending ? old : { ...old, [label]: pending })} onRead={(fields, before) => { onChange(mergeMobileRefundRecipient(value, fields, before)); clearReview(); }} />}
        <FormField label="Ngân hàng nhận của khách (tuỳ chọn)" value={value.bank} editable={!locked} onChangeText={bank => change({ bank })} maxLength={150} />
        <FormField label="Số tài khoản khách nhận (tuỳ chọn)" value={value.recipientAccount} editable={!locked} onChangeText={recipientAccount => change({ recipientAccount })} maxLength={150} />
        <FormField label="Tên chủ tài khoản nhận (tuỳ chọn)" value={value.recipientName} editable={!locked} onChangeText={recipientName => change({ recipientName })} maxLength={150} />
      </>}
    </View>;
  }
  const overlays = <>
    {resolving && <ConfirmEdit title="Đối chiếu trả xe?" message="Nếu đã ghi, mở phiếu gốc để kiểm tra. Nếu chưa ghi, khóa mã cũ và giữ biểu mẫu để rà soát lại."
      confirmLabel="Đối chiếu với máy chủ" onCancel={() => setResolving(false)} onConfirm={() => {
        setResolving(false); void action.resolve().then(() => {
          if (alive.current) { setFees(null); setFeeInput(null); clearReview(); setStep(lines.length ? 1 : 0); }
        });
      }} />}
    {action.exit && <ConfirmEdit title={action.busy ? 'Đang ghi trả xe' : 'Rời bước trả xe?'} busy={action.busy}
      message={action.busy ? 'Chờ máy chủ xác nhận kết quả.' : 'Nội dung chưa gửi sẽ mất. Mã yêu cầu đã gửi vẫn được giữ để đối chiếu.'}
      confirmLabel="Rời bước trả xe" onCancel={action.dismissExit} onConfirm={action.leave} />}
    {confirm && review && reviewInput && <ConfirmEdit title={`Xác nhận trả ${review.fees.items.length} xe?`}
      message={'Nhận ' + review.fees.items.length + ' xe · thực thu ' + money(review.totals.income) + ' · hoàn thuê ' + money(review.totals.rentalRefund) + ' · hoàn cọc ' + money(review.totals.depositRefund) + '. Kiểm tra tiền thực tế trước khi xác nhận.'}
      confirmLabel={`Xác nhận trả ${review.fees.items.length} xe`} onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); if (Object.values(qrPending).some(Boolean)) { setError('Còn ảnh QR chưa lưu. Lưu hoặc bỏ ảnh trước khi xác nhận.'); return; } void action.submit({ ...reviewInput, settlement_snapshot: review.snapshot }); }} />}
  </>;
  if (!action.checked) return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
    <KeyboardFormScrollView contentContainerStyle={{ padding: 16 }}><Card style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 19, fontWeight: '700' }}>Kiểm tra thao tác trên thiết bị</Text>
      {!!action.error && <InlineError message={action.error} />}
      <Button label="Đọc lại thao tác trả xe" loading={action.checking} onPress={() => { void action.checkPending(); }} />
      <Button label="Mở Tài khoản để đối chiếu" secondary disabled={action.checking} onPress={action.openAccount} />
    </Card></KeyboardFormScrollView>{overlays}
  </SafeAreaView>;
  if (action.key) return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
    <KeyboardFormScrollView contentContainerStyle={{ padding: 16 }}><Card style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>Trả xe đang chờ đối chiếu</Text>
      <Text style={{ color: theme.muted, fontSize: 14, lineHeight: 21 }}>Kiểm tra phiếu gốc trước khi trả hoặc ghi tiền thêm. Nội dung đang nhập được giữ trong màn hình này.</Text>
      {!!action.error && <InlineError message={action.error} />}
      <Button label="Đối chiếu trả xe với máy chủ" loading={action.busy} onPress={() => setResolving(true)} />
      <Button label="Mở phiếu trả xe" secondary disabled={action.busy} onPress={action.openReceipt} />
    </Card></KeyboardFormScrollView>{overlays}
  </SafeAreaView>;
  if (!data) return <><StateView title="Chuẩn bị trả xe" loading={query.isPending} message={query.isError ? (query.error as Error).message : undefined} retry={query.isError ? () => { void query.refetch(); } : undefined} />{overlays}</>;
  const stepTitles = ['Chọn xe cần trả', '1. Xe trả và phí thực tế', '2. Thu phí và hoàn tiền', '3. Xác nhận trả xe'];
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
    <KeyboardFormScrollView
      ref={scroll}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ padding: 20, gap: 18, maxWidth: 760, width: '100%', alignSelf: 'center' }}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => { void query.refetch(); }}
          tintColor={theme.primary}
        />
      }
    >
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>{stepTitles[step]}</Text>
      <Text style={{ color: theme.muted, fontSize: 14, lineHeight: 21 }}>{data.code} · đã chọn {lines.length} xe{data.ownership ? ' · thuê sở hữu' : ''}</Text>
      {!!error && <InlineError message={error} />}
      {!!action.error && <InlineError message={action.error} />}
      {!!action.notice && <Text accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: 14, lineHeight: 21 }}>{action.notice}</Text>}
      {query.isError && <InlineError message="Chưa cập nhật được dữ liệu trả xe. Giữ nội dung và tải lại trước khi rà soát." />}
      {!data.available && <InlineError message={data.blockedReason || 'Hợp đồng chưa cho phép trả xe.'} />}
      {step === 0 && <>
        <Card style={{ gap: 14 }}>
          <Text style={{ color: theme.text, fontSize: 14, lineHeight: 21 }}>Chỉ tích xe khách thực tế trả. Xe chưa chọn tiếp tục thuê; tối đa 50 xe mỗi lượt.</Text>
          {data.items.rows.map(row => {
            const checked = lines.some(line => line.vehicle.id === row.id);
            return <Pressable key={row.id} accessibilityRole="checkbox" accessibilityLabel={'Chọn trả xe ' + (row.license || row.name || row.vehicleId)} accessibilityState={{ checked, disabled: locked || !row.available || query.isPlaceholderData }}
              disabled={locked || !row.available || query.isPlaceholderData} onPress={() => {
                if (!checked && lines.length >= 50) { setError('Mỗi lượt chọn tối đa 50 xe.'); return; }
                setLines(old => {
                  if (checked) return old.filter(line => line.vehicle.id !== row.id);
                  const created = newReturnLine(row);
                  return [...old, syncReturnLineTiming(created, created.returnedAt, Boolean(data.ownership))];
                });
                setFees(null); setFeeInput(null); clearReview();
              }} style={({ pressed }) => ({ padding: 14, gap: 5, minHeight: 64, borderWidth: 1, borderColor: checked ? theme.primary : theme.border, borderRadius: 12, backgroundColor: checked ? theme.tint : theme.surface, opacity: pressed ? 0.7 : row.available ? 1 : 0.6 })}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{checked ? 'Đã chọn · ' : ''}{row.license || row.name || ('Xe #' + row.vehicleId)}</Text>
              <Text style={{ color: theme.muted, fontSize: 13.5, lineHeight: 20 }}>{row.returnAt ? 'Hạn trả ' + dateTime(row.returnAt) : 'Chưa có hạn trả'}{row.completedAt ? ' · đã trả' : ''}</Text>
              {!!row.blockedReason && <Text style={{ color: theme.danger, fontSize: 13.5, lineHeight: 20 }}>{row.blockedReason}</Text>}
            </Pressable>;
          })}
          {!data.items.rows.length && <Text style={{ color: theme.muted }}>Không có dòng xe để trả.</Text>}
        </Card>
        <Text style={{ color: theme.muted, fontSize: 13.5 }}>Trang {data.items.page}/{data.items.pages}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button size="sm" equalWidth label="Trang xe trước" secondary disabled={page <= 1 || locked || query.isFetching} onPress={() => { setPage(p => p - 1); top(); }} />
          <Button size="sm" equalWidth label="Trang xe tiếp" secondary disabled={page >= data.items.pages || locked || query.isFetching} onPress={() => { setPage(p => p + 1); top(); }} />
        </View>
        <Button label="Tiếp tục: Xe trả và phí thực tế" disabled={!lines.length || locked || !data.available || query.isFetching || query.isError} onPress={() => { setLineIndex(0); setStep(1); top(); }} />
      </>}
      {step === 1 && selected && estimate && <>
        <Card style={{ gap: 16 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 19, fontWeight: '800' }}>Xe {lineIndex + 1}/{lines.length} · {selected.vehicle.license || selected.vehicle.name}</Text>
          <Text style={{ color: theme.muted, fontSize: 14, lineHeight: 21 }}>
            Hạn trả {dateTime(selected.vehicle.returnAt ?? '')} · giá ngày {selected.vehicle.dailyPrice === null ? 'cần đối chiếu' : money(selected.vehicle.dailyPrice)}
          </Text>
          <RentalDateTime label="ngày giờ khách trả thực tế (24h)" value={selected.returnedAt} disabled={locked} onChange={changeReturnedAt} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button size="sm" secondary label="Đặt giờ hiện tại" disabled={locked} onPress={() => changeReturnedAt(returnLocalTime())} />
            <Button size="sm" secondary label="Ảnh & video trả xe" disabled={locked} onPress={() => router.push({ pathname: '/record-media/[entity]/[id]', params: { entity: 'contracts', id, kind: 'return', referenceId: String(selected.vehicle.id) } })} />
          </View>
          <Text style={{ color: theme.muted, fontSize: 12.5, lineHeight: 18 }}>
            Nhập đúng giờ khách trả thực tế (có thể sửa nếu khách trả trước mà giờ mới ghi nhận).
          </Text>

          {/* Live Web-Matched Early / Late / On-time Auto-Calculation Banner */}
          {estimate.late ? (
            <InfoBanner
              tone="warning"
              title={lateEstimateText(estimate)}
              message={
                estimate.missingDayPrice
                  ? 'Chưa có giá ngày để gợi ý. Nhập phí quá hạn thực tế, kể cả 0đ.'
                  : estimate.suggested > 0
                    ? `Gợi ý phí quá hạn: ${money(estimate.suggested)} — chỉ tham khảo, nhập đúng số khách đã trả.`
                    : 'Gợi ý phí quá hạn: 0 đ — có thể sửa theo thực tế.'
              }
            />
          ) : estimate.early ? (
            <InfoBanner
              tone="info"
              title={earlyEstimateText(estimate, selected.vehicle.dailyPrice)}
              message={
                data.ownership
                  ? 'Tiền thuê sở hữu được đối chiếu theo lịch đóng tiền; không tự giảm vào kỳ đầu.'
                  : estimate.suggested > 0
                    ? `Gợi ý giảm tiền thuê do trả sớm: ${money(estimate.suggested)} (${estimate.unusedDays} ngày chưa dùng × ${money(selected.vehicle.dailyPrice)}/ngày) — đã điền sẵn, có thể sửa theo thỏa thuận.`
                    : 'Trả sớm dưới 1 ngày (gợi ý 0 đ). Có thể nhập số giảm thỏa thuận nếu có.'
              }
            />
          ) : (
            <InfoBanner tone="success" title="Trả đúng hạn · không điều chỉnh" message="Không phát sinh phí quá hạn hay giảm tiền thuê do trả sớm." />
          )}

          {/* Late fee fields — only shown when returning late (exact Web ContractRowReturnDialog behavior) */}
          {estimate.late && (
            <>
              <FormField
                label="Đơn giá trễ / giờ — gợi ý (VNĐ)"
                hint="Chỉ để gợi ý phí quá hạn. Số tiền thu thực tế nhập bên dưới, không bắt khớp gợi ý."
                value={selected.hourlyRate}
                keyboardType="number-pad"
                editable={!locked}
                maxLength={7}
                onChangeText={hourlyRate => editLine({ hourlyRate })}
              />
              <FormField
                label="Phí quá hạn ghi vào hợp đồng (+)"
                hint={estimate.suggested > 0 ? `Để trống sẽ áp dụng gợi ý ${money(estimate.suggested)}. Nhập 0 nếu không thu.` : 'Nhập phí quá hạn thực tế (0 nếu không thu).'}
                value={selected.lateOverride}
                keyboardType="number-pad"
                editable={!locked}
                maxLength={13}
                onChangeText={lateOverride => editLine({ lateOverride })}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {estimate.suggested > 0 && (
                  <Button
                    size="sm"
                    secondary
                    label={`Dùng gợi ý (${money(estimate.suggested)})`}
                    disabled={locked}
                    onPress={() => editLine({ lateOverride: String(estimate.suggested) })}
                  />
                )}
                <Button
                  size="sm"
                  secondary
                  label={selected.lateOverride === '0' ? 'Đã miễn phí quá hạn (0đ)' : 'Không thu phí quá hạn (0đ)'}
                  disabled={locked}
                  onPress={() => editLine({ lateOverride: selected.lateOverride === '0' ? '' : '0' })}
                />
              </View>
            </>
          )}

          {/* Early return discount field — only shown when returning early and not ownership (exact Web behavior) */}
          {estimate.early && !data.ownership && (
            <>
              <FormField
                label="Giảm tiền thuê do trả sớm (−)"
                hint={
                  estimate.suggested > 0
                    ? `Gợi ý theo số ngày chưa dùng: ${money(estimate.suggested)}. Có thể sửa hoặc chọn 0đ.`
                    : 'Nhập số tiền giảm do trả sớm (VNĐ), để trống hoặc 0 nếu không giảm.'
                }
                value={selected.earlyDiscount}
                keyboardType="number-pad"
                editable={!locked}
                maxLength={13}
                onChangeText={earlyDiscount => editLine({ earlyDiscount, earlyTouched: true })}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {estimate.suggested > 0 && (
                  <Button
                    size="sm"
                    secondary
                    label={`Dùng gợi ý (${money(estimate.suggested)})`}
                    disabled={locked}
                    onPress={() => editLine({ earlyDiscount: String(estimate.suggested), earlyTouched: false })}
                  />
                )}
                <Button
                  size="sm"
                  secondary
                  label={selected.earlyDiscount === '0' || !selected.earlyDiscount ? 'Không giảm (0đ)' : 'Đặt về 0đ'}
                  disabled={locked}
                  onPress={() => editLine({ earlyDiscount: '0', earlyTouched: true })}
                />
              </View>
            </>
          )}

          <FormField label="Thu sửa chữa do khách làm hỏng (VNĐ)" value={selected.repairFee} keyboardType="number-pad" editable={!locked} maxLength={13} onChangeText={repairFee => editLine({ repairFee })} />
          <FormField label="Nội dung hư hỏng / sửa chữa" value={selected.repairNote} multiline editable={!locked} maxLength={1000} onChangeText={repairNote => editLine({ repairNote })} />
        </Card>
        {lines.length > 1 && <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button size="sm" equalWidth label="Xe trước" secondary disabled={lineIndex <= 0 || locked} onPress={() => { setLineIndex(i => i - 1); top(); }} />
          <Button size="sm" equalWidth label="Xe tiếp" secondary disabled={lineIndex >= lines.length - 1 || locked} onPress={() => { setLineIndex(i => i + 1); top(); }} />
        </View>}
        <Button label="Tiếp tục: Thu phí và hoàn tiền" loading={previewing} disabled={locked && !previewing || !data.available || query.isError} onPress={() => { void calculateFees(); }} />
        <Button label="Sửa lựa chọn xe" secondary disabled={locked} onPress={() => { setStep(0); top(); }} />
      </>}
      {step === 2 && fees && <>
        <Card style={{ gap: 10 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>Đối chiếu tiền thuê sau trả xe</Text>
          <View style={{ gap: 2 }}>
            {fees.items.map(row => <KeyValueRow key={row.id} label={row.license || row.name} value={`Trễ ${money(row.lateFee)} · Sửa ${money(row.repairFee)} · Giảm sớm ${money(row.earlyDiscount)}`} />)}
            <KeyValueRow label="Tiền thuê sau trả xe" value={money(fees.after.totalAmount)} />
            <KeyValueRow label="Còn thiếu (không trừ cọc)" value={money(fees.after.rentalRemaining)} emphasize />
            <KeyValueRow label="Cọc đang giữ & xe còn lại" value={`${money(fees.after.depositHeld)} · Còn ${fees.after.remainingItems} xe`} />
          </View>
          <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19 }}>
            Chỉ chọn khoản đã thực nhận hoặc đã hoàn cho khách. Mỗi khoản tạo một phiếu thu/chi cùng lượt xác nhận.
          </Text>
        </Card>

        {/* Web-matched 1-tap suggested collections (Phí quá hạn, Phí sửa chữa, Công nợ tiền thuê) */}
        {quickCollectionDefs.filter(def => suggestedByKind[def.kind] > 0 || receipts.some(r => r.kind === def.kind)).map(def => {
          const suggested = suggestedByKind[def.kind];
          const idx = receipts.findIndex(r => r.kind === def.kind);
          const enabled = idx >= 0;
          const activeReceipt = enabled ? receipts[idx] : null;
          return (
            <Card key={def.kind} style={{ gap: 12 }}>
              <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 17, fontWeight: '700' }}>
                {def.title} · gợi ý {money(suggested)}
              </Text>
              <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19 }}>
                Gợi ý {money(suggested)} — có thể sửa theo số khách đã trả; không bắt khớp.
              </Text>
              <ChoiceField
                label={def.title}
                value={enabled ? 'yes' : 'no'}
                choices={[
                  { value: 'no', label: 'Chưa thu khoản này' },
                  { value: 'yes', label: def.toggleLabel },
                ]}
                disabled={locked}
                onChange={v => {
                  if ((v === 'yes') !== enabled) toggleQuickReceipt(def.kind, suggested);
                }}
              />
              {activeReceipt && moneyFields(
                activeReceipt,
                next => setReceipts(old => old.map((r, i) => i === idx ? { ...next, kind: r.kind } : r)),
                def.title,
              )}
            </Card>
          );
        })}

        {/* Optional additional receipt for split payments / edge cases */}
        <Card style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 16.5, fontWeight: '700' }}>
            Khoản thực thu khác ({receipts.length} phiếu)
          </Text>
          <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19 }}>
            Đã chọn thu: {money(collectedTotal)} · Còn phải thu sau lượt này: {outstandingAfterReceipts === null ? 'Chưa đối chiếu' : money(outstandingAfterReceipts)}
          </Text>
          {receipts.length > 1 && receipts.map((row, i) => (
            <Button
              key={i}
              size="sm"
              secondary
              label={`Phiếu thu #${i + 1} · ${kinds.find(k => k.value === row.kind)?.label || row.kind} · ${row.amount ? money(Number(row.amount)) : 'chưa nhập tiền'}`}
              disabled={locked}
              onPress={() => setReceiptIndex(i)}
            />
          ))}
          {receipts[receiptIndex] && !quickCollectionDefs.some(def => def.kind === receipts[receiptIndex].kind && receipts.filter(r => r.kind === def.kind).length === 1 && suggestedByKind[def.kind] > 0) && (
            <>
              <ChoiceField label="Loại khoản thu" value={receipts[receiptIndex].kind} choices={kinds} disabled={locked} onChange={kind => { setReceipts(old => old.map((r, i) => i === receiptIndex ? { ...r, kind: kind as ReturnReceiptDraft['kind'] } : r)); clearReview(); }} />
              {moneyFields(receipts[receiptIndex], next => setReceipts(old => old.map((r, i) => i === receiptIndex ? { ...next, kind: r.kind } : r)), 'Khoản thu ' + (receiptIndex + 1))}
              <Button size="sm" label="Bỏ khoản thu này" secondary danger disabled={locked} onPress={() => { setReceipts(old => old.filter((_, i) => i !== receiptIndex)); setReceiptIndex(0); clearReview(); }} />
            </>
          )}
          <Button size="sm" label="Thêm khoản thực thu" secondary disabled={locked || receipts.length >= 50} onPress={() => { setReceiptIndex(receipts.length); setReceipts(old => [...old, { ...defaultMoney('', true), kind: 'rental_debt' }]); clearReview(); }} />
        </Card>

        {/* Early-return rental refund — Exact Web ReturnSettlementFields labels */}
        <Card style={{ gap: 14 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 17, fontWeight: '700' }}>
            Tiền thuê được hoàn do trả sớm: {money(fees.after.rentalRefundable)}
          </Text>
          <Text style={{ color: theme.muted, fontSize: 13.5, lineHeight: 20 }}>
            {fees.after.rentalRefundable > 0
              ? 'Ghi riêng tiền thuê đã hoàn, cộng với hoàn cọc thành tổng tiền trả khách. Chưa hoàn thì để trống; có thể ghi phiếu chi sau.'
              : 'Mức đối chiếu hiện là 0 đ. Nếu đã hoàn, khoản chi sẽ được ghi vào Bất thường HĐ.'}
          </Text>
          <ChoiceField
            label="Hoàn tiền thuê trả sớm"
            value={rentalRefund ? 'yes' : 'no'}
            choices={[
              { value: 'no', label: 'Chưa hoàn tiền thuê' },
              { value: 'yes', label: 'Đã hoàn tiền thuê do trả sớm' },
            ]}
            disabled={locked}
            onChange={v => {
              setRentalRefund(v === 'yes' ? defaultMoney(fees.after.rentalRefundable > 0 ? String(fees.after.rentalRefundable) : '', true) : null);
              clearReview();
            }}
          />
          {rentalRefund && moneyFields(rentalRefund, setRentalRefund, 'Hoàn tiền thuê do trả sớm', true)}
        </Card>

        {/* Deposit refund — Exact Web ReturnSettlementFields labels */}
        <Card style={{ gap: 14 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 17, fontWeight: '700' }}>
            Cọc còn giữ: {money(fees.after.depositHeld)}
          </Text>
          <Text style={{ color: theme.muted, fontSize: 13.5, lineHeight: 20 }}>
            {fees.after.closesRental
              ? 'Chỉ tick «Đã hoàn cọc cho khách» khi đã nhận đủ xe và thu đủ công nợ.'
              : 'Chưa thể tick đã hoàn cọc vì hợp đồng còn xe chưa nhận lại.'}
          </Text>
          <ChoiceField
            label="Quyết định hoàn cọc"
            value={depositRefund ? 'yes' : 'no'}
            choices={[
              {
                value: 'no',
                label: fees.after.depositHeld > 0
                  ? `Chưa hoàn cọc — chờ kế toán hoàn ${money(fees.after.depositHeld)}`
                  : 'Chưa hoàn cọc',
              },
              { value: 'yes', label: 'Đã hoàn cọc cho khách' },
            ]}
            disabled={locked || !fees.after.closesRental || fees.after.depositHeld <= 0}
            onChange={v => {
              setDepositRefund(v === 'yes' ? defaultMoney(String(fees.after.depositHeld), false) : null);
              clearReview();
            }}
          />
          {depositRefund ? moneyFields(depositRefund, setDepositRefund, 'Hoàn cọc cho khách', true) : fees.after.depositHeld > 0 && <>
            <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19 }}>
              Mặc định giữ cọc để xác nhận trả xe. Gửi QR hoặc STK bên dưới lên Telegram nếu kế toán hoàn sau; khi đã chuyển tiền mới ghi phiếu chi.
            </Text>
            {lines[0] && <RefundQrReader id={id} itemId={lines[0].vehicle.id} value={deferredRecipient} onPendingChange={pending => setQrPending(old => old.deferred === pending ? old : { ...old, deferred: pending })} onRead={(fields, before) => { setDeferredRecipient(old => mergeMobileRefundRecipient(old, fields, before)); clearReview(); }} />}
            <FormField label="Ngân hàng nhận của khách (tuỳ chọn)" value={deferredRecipient.bank} editable={!locked} onChangeText={bank => { setDeferredRecipient(old => ({ ...old, bank })); clearReview(); }} maxLength={150} />
            <FormField label="Số tài khoản khách nhận (tuỳ chọn)" value={deferredRecipient.recipientAccount} editable={!locked} onChangeText={recipientAccount => { setDeferredRecipient(old => ({ ...old, recipientAccount })); clearReview(); }} maxLength={150} />
            <FormField label="Tên chủ tài khoản nhận (tuỳ chọn)" value={deferredRecipient.recipientName} editable={!locked} onChangeText={recipientName => { setDeferredRecipient(old => ({ ...old, recipientName })); clearReview(); }} maxLength={150} />
          </>}
        </Card>
        <Button label="Rà soát & Xác nhận trả xe" loading={previewing} disabled={locked && !previewing || query.isError} onPress={() => { void calculateSettlement(); }} />
        <Button label="Sửa giờ và phí xe" secondary disabled={locked} onPress={() => { setStep(1); clearReview(); top(); }} />
      </>}
      {step === 3 && review && <>
        <Card style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>Xác nhận tiền thực tế</Text>
          <View style={{ gap: 2 }}>
            <KeyValueRow label="Số xe nhận & còn lại" value={`Nhận ${review.fees.items.length} xe · Còn ${review.after.remainingItems} xe`} emphasize />
            {review.payments.map((row, i) => <KeyValueRow key={i} label={`${row.kind === 'rental_refund' ? 'Đã hoàn tiền thuê do trả sớm' : row.kind === 'deposit_refund' ? 'Đã hoàn cọc cho khách' : kinds.find(k => k.value === row.kind)?.label} (${row.label})`} value={`${money(Number(row.amount))} · ${dateTime(row.paid_at + ':00+07:00')}`} emphasize />)}
            <KeyValueRow label="Tiền thuê sau trả xe" value={money(review.after.totalAmount)} />
            <KeyValueRow label="Còn thiếu" value={money(review.after.rentalRemaining)} emphasize />
            <KeyValueRow label="Cọc còn giữ" value={money(review.after.depositHeld)} />
          </View>
          {!review.payments.length && <Text style={{ color: theme.muted, fontSize: 13.5 }}>Không ghi khoản thu/hoàn trong lượt này.</Text>}
          {review.settlement.refund_deferred && <Text style={{ color: theme.warning, fontSize: 13.5 }}>Chưa hoàn cọc — cọc được giữ để kế toán hoàn sau.</Text>}
          {review.overpayment && <Text accessibilityRole="alert" style={{ color: theme.warning, fontSize: 13.5, lineHeight: 20 }}>Tiền thực thu vượt phần còn thiếu. Tổng phí tăng thêm {money(review.totals.totalIncrease)}. Chỉ xác nhận khi đúng khoản khách đã trả.</Text>}
        </Card>
        {review.overpayment && !review.overpaymentAcknowledged && <Button label="Xác nhận khoản thu vượt và rà soát lại" loading={previewing} onPress={() => { void calculateSettlement(true); }} />}
        <Button label={`Xác nhận trả ${review.fees.items.length} xe`} disabled={locked || query.isError || review.overpayment && !review.overpaymentAcknowledged} onPress={() => setConfirm(true)} />
        <Button label="Sửa khoản thu và hoàn" secondary disabled={locked} onPress={() => { setStep(2); clearReview(); top(); }} />
      </>}
      <Button
        secondary
        label="Gửi Telegram trả xe"
        disabled={action.busy}
        onPress={() => router.push({ pathname: '/contract-telegram/[id]', params: { id, eventKind: 'return' } })}
      />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button size="sm" equalWidth label="Tải lại dữ liệu trả xe" secondary loading={query.isFetching} disabled={locked} onPress={() => { void query.refetch(); }} />
        <Button size="sm" equalWidth label="Ẩn bàn phím" secondary disabled={action.busy} onPress={() => Keyboard.dismiss()} />
      </View>
    </KeyboardFormScrollView>
    {overlays}
  </SafeAreaView>;
}
