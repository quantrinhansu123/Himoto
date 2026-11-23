import { KeyboardFormScrollView } from "./keyboard-form-scroll-view";
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, Text, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack, usePreventRemove } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { MobileDraftVehicle } from '@himoto/mobile-contract';
import { validDraftTime } from '@himoto/mobile-draft-validation';
import type { MobileLifecycleAction, MobileLifecycleContext, MobileLifecycleInput } from '../../../shared/mobile-contract-lifecycle';
import { useContractLifecycleWrite } from '@/hooks/use-contract-lifecycle-write';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useSession } from '@/providers/session';
import { dateTime, money, useTheme } from '@/theme';
import { contextualStatusLabel } from '@/lib/catalogue-config';
import { Button, Card, InlineError, KeyValueRow, StateView, StatusBadge } from './ui';
import { ChoiceField, FormField } from './form-fields';
import { RentalDateTime } from './rental-date-time';
import { ConfirmEdit } from './editor-sheet';
import { DraftVehiclePicker } from './draft-pickers';

const now = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16);
const descriptions: Record<MobileLifecycleAction, string> = {
  mark_bad_debt: 'Chuyển hợp đồng thực sự quá hạn sang Nợ xấu. Khoản nợ cũ được giữ; xe còn đang thuê vẫn phải thu hồi thực tế.',
  close_bad_debt: 'Đóng hợp đồng nợ xấu khi đã thu hồi đủ xe. Khoản chưa thanh toán tiếp tục được theo dõi trong Công nợ; không tạo phiếu thu/chi, không xóa nợ hoặc xác nhận tất toán.',
  settle: 'Đối chiếu đủ tiền thuê, phí và cọc. Nếu đã trả đủ xe, xác nhận sẽ đóng hợp đồng. Nếu chưa trả đủ xe, hợp đồng tiếp tục giữ Nợ xấu.',
  hold: 'Chỉ xác nhận khi đã thực tế thu về các xe còn đang thuê. Xe được giải phóng để thuê lại; dừng kỳ mới, giữ nợ và cọc cũ. Lượt gỡ giữ lịch sử chưa rõ ngày thu hồi giữ nguyên mốc và kho cũ.',
  update_hold: 'Sửa hạn kết thúc bảo lưu. Giữ ngày bắt đầu, tiền và lịch sử cũ; hết hạn chỉ báo cần xử lý, không tự chuyển trạng thái.',
  resume: 'Tiếp tục chính hợp đồng này. Chọn đủ xe đang rảnh và đối chiếu lịch còn lại. Giữ nợ/cọc/lịch sử cũ; dời các kỳ chưa phát sinh theo thời gian bảo lưu.',
  complete_hold: 'Hoàn thành và dừng theo dõi khoản không thu hồi. Phần còn thiếu được ghi là tổn thất công nợ, không tạo phiếu thu/chi và không cộng vào doanh thu thực thu. Tiền đã thu/hoàn và cọc giữ theo lịch sử.',
};
export function ContractLifecycleEditor({ id, initialAction }: { id: string; initialAction?: 'close_bad_debt' | 'mark_bad_debt' }) {
  const write = useContractLifecycleWrite(id), theme = useTheme(), { session } = useSession(), scroll = useRef<ScrollViewInstance>(null);
  const [dirty, setDirty] = useState(false), [exit, setExit] = useState<(() => void) | null>(null), [confirm, setConfirm] = useState<MobileLifecycleInput | null>(null), [reload, setReload] = useState(false), [formVersion, setFormVersion] = useState(0), [eventCount, setEventCount] = useState(50);
  const disablePrevention = usePreventRemove(write.busy || dirty && !write.proof, ({ repeat }) => setExit(() => repeat));
  useEffect(() => { if (write.entry || write.error) { scroll.current?.scrollTo({ y: 0, animated: false }); AccessibilityInfo.announceForAccessibility(write.error || 'Kiểm tra kết quả tình trạng hợp đồng.'); } }, [write.entry, write.error]);
  const context = write.query.data?.context, disabled = write.busy || !!write.entry || write.query.isError;
  const text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
    <Stack.Screen options={{ title: 'Tình trạng xe / nợ / bảo lưu' }} />

      <KeyboardFormScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 18, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center', paddingBottom: 36 }}>
        <Text accessibilityRole="header" style={{ ...text, fontSize: 20, lineHeight: 28, fontWeight: '800' }}>Tình trạng hợp đồng</Text>
        {!!(write.error || write.query.error) && <InlineError message={write.error || write.query.error?.message || 'Chưa tải được tình trạng.'} />}
        {!!write.notice && <Text accessibilityLiveRegion="polite" style={text}>{write.notice}</Text>}
        {write.query.isPending && <StateView title="Đang đối chiếu xe, công nợ và tiền cọc" loading />}
        {write.query.isError && <Button secondary label="Tải lại tình trạng hợp đồng" disabled={write.busy} onPress={() => void write.query.refetch()} />}
        {write.entry && <Card style={{ gap: 14 }}>
          <Text accessibilityRole="header" style={{ ...text, fontSize: 18, fontWeight: '700' }}>{write.proof ? 'Đã ghi nhận tình trạng hợp đồng' : 'Cần đối chiếu thao tác trước'}</Text>
          <Text selectable style={muted}>Mã thao tác: {write.entry.key}</Text>
          {write.proof ? <>
            <Text style={text}>Hợp đồng #{write.proof.receipt.id} · phiên bản ghi nhận {write.proof.receipt.revision}.</Text>
            <Text style={muted}>Mở hợp đồng để xem xe, tiền và trạng thái hiện tại. Kết quả này xác nhận lần ghi gốc.</Text>
            <Button label="Đã kiểm tra, mở hợp đồng" loading={write.busy} onPress={() => void write.acknowledge(disablePrevention)} />
            <Button secondary label="Gửi Telegram hợp đồng" loading={write.busy} onPress={() => void write.acknowledge(disablePrevention, () => router.replace({ pathname: '/contract-telegram/[id]', params: { id } }))} />
          </> : <><Text style={text}>Mở kết quả nếu đã ghi; khóa mã chưa ghi trước khi cho thao tác tiếp.</Text><Button label="Đối chiếu thao tác tình trạng" loading={write.busy} onPress={() => void write.resolve()} /></>}
        </Card>}
        {context && <>
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Text selectable style={{ ...text, fontSize: 20, fontWeight: '800' }}>{context.code}</Text>
              <StatusBadge status={context.status === 'renting' && context.overdue ? 'overdue' : context.status} label={contextualStatusLabel('contracts', context.status === 'renting' && context.overdue ? 'overdue' : context.status)} />
            </View>
            <View style={{ gap: 2 }}>
              <KeyValueRow label="Đã trả / thu hồi" value={`${context.returnedCount}/${context.items.length} lượt xe`} />
              <KeyValueRow label="Thuê / phí còn phải đối chiếu" value={money(context.remaining)} emphasize />
              <KeyValueRow label="Cọc còn giữ" value={money(context.depositHeld)} />
              <KeyValueRow label="Tiền thu dư" value={money(context.overpayment)} />
              {context.completedFromHold && <KeyValueRow label="Tổn thất công nợ" value={money(context.waivedAmount)} emphasize />}
              {context.status === 'reserved' && <KeyValueRow label="Thời gian bảo lưu" value={`${dateTime(context.heldAt || '')} → ${dateTime(context.holdUntil || '')}`} />}
            </View>
            <Text style={muted}>{context.completedFromHold ? 'Đã hoàn thành sau bảo lưu; dừng theo dõi phần công nợ không thu hồi.' : context.settlementNote}</Text>
            {context.badDebtClosedAt && <Text style={{ ...text, color: theme.warning, fontWeight: '700' }}>Đã đóng hợp đồng nợ xấu ({dateTime(context.badDebtClosedAt)}). Công nợ còn lại: {money(context.remaining)}; tiếp tục thu hồi theo thực tế.</Text>}
            {context.status === 'reserved' && <Text style={{ ...text, color: context.holdExpired ? theme.danger : theme.muted }}>{context.holdExpired ? 'Hết hạn bảo lưu. Chờ xác nhận tiếp tục thuê hoặc hoàn thành.' : 'Dừng phát sinh kỳ mới; nợ và cọc trước bảo lưu được giữ.'}</Text>}
          </Card>
          {context.items.map(i => <Card key={i.id} style={{ gap: 4 }}><KeyValueRow label={`${i.license || i.name} · lượt #${i.id}`} value={i.reconciled ? 'Đã gỡ giữ xe' : i.completedAt ? `Đã trả: ${dateTime(i.completedAt)}` : `Hẹn trả: ${dateTime(i.endsAt || '')}`} emphasize={!i.completedAt && !i.reconciled} /></Card>)}
          {!write.entry && context.actions.length > 0 && <LifecycleActionForm key={formVersion} id={id} context={context} initialAction={initialAction} disabled={disabled} onDirty={() => setDirty(true)} onReview={setConfirm} />}
          {(context.status === 'bad_debt' || Boolean(context.badDebtClosedAt)) && !context.allReturned && session?.user.permissions.includes('contracts.return') && <Button secondary label="Thu hồi xe nợ xấu" disabled={write.busy} onPress={() => router.push({ pathname: '/recovery-editor/[id]', params: { id } })} />}
          {context.status === 'bad_debt' && !context.allReturned && session?.user.permissions.includes('contracts.settle') && <Button label="Đóng hợp đồng nợ xấu (kể cả xe còn ở khách)" disabled={write.busy} onPress={() => router.push({ pathname: '/contract-operation/[action]/[id]', params: { action: 'payment_settlement', id, mode: 'close_unpaid' } })} />}
          {session?.user.permissions.some(p => p === 'finance.read' || p === 'finance.write') && <Button secondary label="Thu / chi và xử lý cọc" disabled={write.busy} onPress={() => router.push({ pathname: '/finance/[id]', params: { id } })} />}
          <Button secondary label="Gửi Telegram hợp đồng" disabled={write.busy} onPress={() => router.push({ pathname: '/contract-telegram/[id]', params: { id } })} />
          {!write.entry && <Button secondary label="Làm mới tình trạng hợp đồng" disabled={write.busy || write.query.isFetching} onPress={() => setReload(true)} />}
          <Text accessibilityRole="header" style={{ ...text, fontSize: 18, fontWeight: '700' }}>Lịch sử trạng thái</Text>
          {context.events.length ? context.events.slice(-eventCount).reverse().map((e, i) => <Card key={`${e.recordedAt}:${i}`} style={{ gap: 6 }}>
            <Text style={{ ...text, fontWeight: '700' }}>{e.label} · {e.actorName || `#${e.actorId}`}</Text>
            <View style={{ gap: 2 }}>
              <KeyValueRow label="Thời điểm thực tế" value={dateTime(e.at)} />
              <KeyValueRow label="Ghi nhận lúc" value={dateTime(e.recordedAt)} />
              <KeyValueRow label="Chuyển trạng thái" value={`${contextualStatusLabel('contracts', e.from) || e.from} → ${contextualStatusLabel('contracts', e.to) || e.to}`} emphasize />
              {!!e.note && <KeyValueRow label="Ghi chú" value={e.note} />}
            </View>
          </Card>) : <Text style={muted}>Chưa có thao tác trạng thái mới.</Text>}
          {context.events.length > eventCount && <Button secondary label={`Xem thêm lịch sử (${Math.min(eventCount, context.events.length)}/${context.events.length})`} onPress={() => setEventCount(v => v + 50)} />}
        </>}
      </KeyboardFormScrollView>

    {confirm && <ConfirmEdit title={context?.actions.find(a => a.action === confirm.action)?.label || 'Xác nhận tình trạng hợp đồng'} message={`${context?.code || `Hợp đồng #${id}`}\nNgày thực tế: ${dateTime(confirm.at)}\n${confirm.hold_until ? `Bảo lưu đến: ${dateTime(confirm.hold_until)}\n` : ''}${confirm.resume_end ? `Hạn trả mới: ${dateTime(confirm.resume_end)}\n` : ''}\n${descriptions[confirm.action]}${confirm.action === 'complete_hold' ? `\nTổn thất công nợ đang đối chiếu: ${money(context?.remaining ?? null)}` : ''}${confirm.action === 'close_bad_debt' ? `\nCông nợ tiếp tục theo dõi: ${money(context?.remaining ?? null)}` : ''}\n\n${confirm.note}`} confirmLabel={confirm.action === 'close_bad_debt' ? 'Đóng hợp đồng, giữ công nợ' : 'Xác nhận tình trạng hợp đồng'} busy={write.busy} onCancel={() => setConfirm(null)} onConfirm={() => { const input = confirm; setConfirm(null); void write.save(input); }} />}
    {reload && <ConfirmEdit title="Tải lại tình trạng mới nhất?" message="Nội dung chưa gửi sẽ thay bằng tình trạng xe, tiền và lịch mới nhất." confirmLabel="Tải lại tình trạng" onCancel={() => setReload(false)} onConfirm={() => { setReload(false); void write.query.refetch().then(result => { if (result.data?.context) { setDirty(false); setFormVersion(v => v + 1); } }); }} />}
    {exit && <ConfirmEdit title={write.busy ? 'Đang ghi nhận tình trạng' : 'Rời màn tình trạng hợp đồng?'} message={write.busy ? 'Chờ máy chủ xác nhận trước khi rời.' : 'Nội dung chưa gửi sẽ mất. Mã đã gửi được giữ để đối chiếu trong Tài khoản.'} confirmLabel="Rời màn tình trạng" busy={write.busy} onCancel={() => setExit(null)} onConfirm={() => { if (!write.busy) exit(); }} />}
  </SafeAreaView>;
}
function LifecycleActionForm({ id, context, initialAction, disabled, onDirty, onReview }: { id: string; context: MobileLifecycleContext; initialAction?: 'close_bad_debt' | 'mark_bad_debt'; disabled: boolean; onDirty: () => void; onReview: (input: MobileLifecycleInput) => void }) {
  const { api, session } = useSession(), theme = useTheme();
  const [action, setAction] = useState<MobileLifecycleAction | ''>(() => initialAction && context.actions.some(item => item.action === initialAction) ? initialAction : ''), [at, setAt] = useState(now), [holdUntil, setHoldUntil] = useState(''), [resumeEnd, setResumeEnd] = useState(context.suggestedResumeEnd || ''), [note, setNote] = useState(''), [confirmed, setConfirmed] = useState(false), [vehicles, setVehicles] = useState<MobileDraftVehicle[]>([]), [picker, setPicker] = useState(false), [error, setError] = useState('');
  const previewInput = useDebouncedValue(JSON.stringify({ at, ...(resumeEnd ? { resume_end: resumeEnd } : {}) }));
  const preview = useQuery({ queryKey: ['lifecycle-preview', api?.origin, session?.user.id, id, context.revision, previewInput], queryFn: ({ signal }) => api!.lifecyclePreview(id, JSON.parse(previewInput), signal), enabled: !!api && action === 'resume' && validDraftTime(at) && (!resumeEnd || validDraftTime(resumeEnd)), retry: false, staleTime: 0, gcTime: 0 });
  const inventory = useQuery({ queryKey: ['lifecycle-inventory', api?.origin, session?.user.id, id, context.revision], queryFn: ({ signal }) => api!.lifecycleInventory(id, 'page=1', signal), enabled: !!api && action === 'resume', retry: false, staleTime: 0, gcTime: 0 });
  const selectedAction = context.actions.find(a => a.action === action), text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  function changed(task: () => void) { if (!disabled) { task(); setError(''); onDirty(); } }
  function selectLifecycleAction(next: MobileLifecycleAction) {
    if (disabled) return;
    if (action === next) {
      setAction('');
      setError('');
      return;
    }
    changed(() => {
      setAction(next);
      setAt(now());
      setConfirmed(false);
      setHoldUntil(next === 'update_hold' ? context.holdUntil || '' : '');
    });
  }
  const currentPreview = preview.data?.at === at && (!resumeEnd || preview.data?.end === resumeEnd) && preview.data?.revision === context.revision;
  function review() {
    Keyboard.dismiss(); if (!selectedAction || !selectedAction.enabled || !confirmed || !validDraftTime(at)) { setError('Chọn thao tác, nhập ngày giờ thực tế và xác nhận đã đối chiếu.'); return; }
    if ((action === 'hold' || action === 'update_hold') && !validDraftTime(holdUntil)) { setError('Nhập đủ hạn kết thúc bảo lưu.'); return; }
    if (action === 'resume' && (vehicles.length !== context.resumeVehicleCount || !currentPreview || preview.isFetching || preview.isError || inventory.isError)) { setError('Chọn đủ xe và kiểm tra lịch thuê lại trước khi xác nhận.'); return; }
    onReview({ action: action as MobileLifecycleAction, revision: context.revision, at, note: note.trim(), confirmed: true, ...(['hold', 'update_hold'].includes(action) ? { hold_until: holdUntil } : {}), ...(action === 'resume' ? { vehicle_ids: vehicles.map(v => Number(v.id)), resume_end: preview.data!.end } : {}) });
  }
  return <Card style={{ gap: 16 }}>
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={{ ...text, fontSize: 17, fontWeight: '800' }}>Thao tác tình trạng hợp đồng</Text>
      <View style={{ gap: 10 }}>
        {context.actions.map(a => {
          const isSelected = action === a.action;
          const isMarkBadDebt = a.action === 'mark_bad_debt';
          const isPrimaryAction = a.action === 'close_bad_debt' || a.action === 'resume';
          return <View key={a.action} style={{ gap: 4 }}>
            <Button
              label={a.label}
              danger={isMarkBadDebt && a.enabled}
              secondary={!isSelected && !isMarkBadDebt && !isPrimaryAction}
              disabled={disabled || !a.enabled}
              onPress={() => selectLifecycleAction(a.action)}
            />
            {!a.enabled && !!a.reason && <Text style={{ color: theme.muted, fontSize: 12.5, lineHeight: 18 }}>{a.reason}</Text>}
          </View>;
        })}
      </View>
    </View>
    {selectedAction && <View style={{ gap: 14, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Text accessibilityRole="header" style={{ ...text, fontSize: 17, fontWeight: '800', flex: 1 }}>{selectedAction.label}</Text>
        <Button size="sm" secondary label="Đóng" disabled={disabled} onPress={() => { setAction(''); setError(''); }} />
      </View>
      <Text style={text}>{descriptions[selectedAction.action]}</Text>
      {!selectedAction.enabled && <InlineError message={selectedAction.reason || 'Chưa đủ điều kiện thực hiện.'} />}
      <RentalDateTime label={action === 'hold' ? 'thực tế thu xe / bắt đầu bảo lưu' : action === 'resume' ? 'thực tế thuê lại' : 'thực tế xác nhận'} value={at} disabled={disabled} onChange={v => changed(() => setAt(v))} />
      {(action === 'hold' || action === 'update_hold') && <RentalDateTime label="kết thúc bảo lưu" value={holdUntil} disabled={disabled} onChange={v => changed(() => setHoldUntil(v))} />}
      {action === 'resume' && <>
        <RentalDateTime label="hạn trả mới" value={resumeEnd} disabled={disabled} onChange={v => changed(() => setResumeEnd(v))} />
        <Text style={text}>Chọn đủ {context.resumeVehicleCount} xe · đã chọn {vehicles.length}</Text>
        {vehicles.map(v => <View key={v.id} style={{ gap: 8 }}><Text style={text}>#{v.id} · {v.license} · {v.name}</Text><Button secondary danger label={`Bỏ xe thuê lại ${v.license}`} disabled={disabled} onPress={() => changed(() => setVehicles(rows => rows.filter(r => r.id !== v.id)))} /></View>)}
        <Button secondary label="Chọn xe đang rảnh để thuê lại" disabled={disabled || inventory.isPending || inventory.isError || vehicles.length >= context.resumeVehicleCount} onPress={() => setPicker(true)} />
        {inventory.isPending && <Text style={muted}>Đang tải kho xe…</Text>}
        {inventory.isError && <><InlineError message={inventory.error.message} /><Button secondary label="Tải lại kho xe" disabled={disabled} onPress={() => void inventory.refetch()} /></>}
        {preview.isFetching && <Text style={muted}>Đang tính lịch còn lại…</Text>}
        {preview.isError && <><InlineError message={preview.error.message} /><Button secondary label="Tính lại lịch thuê" disabled={disabled} onPress={() => void preview.refetch()} /></>}
        {currentPreview && preview.data && <><Text style={text}>Hạn trả mới: {dateTime(preview.data.end)} · {preview.data.totalPeriods} kỳ.</Text>{preview.data.periods.map((p, i) => <Text key={`${p.dueAt}:${i}`} style={muted}>{dateTime(p.dueAt)} · {money(p.amount)}</Text>)}{preview.data.totalPeriods > preview.data.periods.length && <Text style={muted}>Hiển thị {preview.data.periods.length}/{preview.data.totalPeriods} kỳ. Các kỳ còn lại được giữ trong lịch hợp đồng.</Text>}</>}
      </>}
      <FormField label="Lý do / nội dung đối chiếu trạng thái" value={note} multiline maxLength={1000} editable={!disabled} onChangeText={v => changed(() => setNote(v))} hint="Không bắt buộc; ghi nội dung thực tế để giữ trong lịch sử." />
      <ChoiceField label="Xác nhận đã đối chiếu thực tế" value={confirmed ? 'yes' : 'no'} disabled={disabled} choices={[{ value: 'no', label: 'Chưa xác nhận' }, { value: 'yes', label: action === 'complete_hold' ? 'Đã đối chiếu tổn thất công nợ và đồng ý hoàn thành' : action === 'close_bad_debt' ? 'Đã nhận đủ xe; khoản chưa thanh toán tiếp tục theo dõi và thu hồi' : 'Đã đối chiếu tình trạng xe, tiền và lịch thuê' }]} onChange={v => changed(() => setConfirmed(v === 'yes'))} />
      {!!error && <InlineError message={error} />}
      <Button danger={selectedAction.action === 'mark_bad_debt'} label={selectedAction.action === 'mark_bad_debt' ? 'Xác nhận chuyển sang Nợ xấu' : 'Kiểm tra thao tác tình trạng'} disabled={disabled || !selectedAction.enabled} onPress={review} />
    </View>}
    {picker && inventory.data && <DraftVehiclePicker lifecycleId={id} stores={inventory.data.stores} initialStore="" selectedIds={vehicles.map(v => v.id)} onClose={() => setPicker(false)} onPick={v => { changed(() => { setVehicles(rows => rows.some(r => r.id === v.id) ? rows : [...rows, v]); }); setPicker(false); }} />}
  </Card>;
}
