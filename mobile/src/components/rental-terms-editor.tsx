import { useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, usePreventRemove } from 'expo-router';
import type { MobileRentalTerms, MobileRentalTermsInput } from '../../../shared/mobile-rental-terms';
import { validDraftTime } from '../../../shared/mobile-draft-validation';
import { useRentalTermsWrite } from '@/hooks/use-rental-terms-write';
import { dateTime, money, useTheme } from '@/theme';
import { Button, Card, InlineError, StateView } from './ui';
import { ChoiceField, FormField } from './form-fields';
import { RentalDateTime } from './rental-date-time';
import { ConfirmEdit } from './editor-sheet';

export function RentalTermsEditor({ id }: { id: string }) {
  const write = useRentalTermsWrite(id), theme = useTheme(), scroll = useRef<ScrollViewInstance>(null);
  const [dirty, setDirty] = useState(false), [formEpoch, setFormEpoch] = useState(0), [review, setReview] = useState<MobileRentalTermsInput | null>(null);
  const [reload, setReload] = useState(false), [exit, setExit] = useState<(() => void) | null>(null);
  const disablePrevention = usePreventRemove(write.busy || dirty && !write.proof, ({ repeat }) => setExit(() => repeat));
  const profile = write.query.data?.profile, text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  return <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
    <Stack.Screen options={{ title: 'Sửa tiền / ngày thuê' }} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16 }}>
        {!!write.error && <InlineError message={write.error} />}{!!write.notice && <Text accessibilityLiveRegion="polite" style={muted}>{write.notice}</Text>}
        {write.query.isPending && <StateView title="Đang tải tiền / ngày thuê" loading />}
        {write.query.isError && <StateView title="Chưa tải được tiền / ngày thuê" message={(write.query.error as Error).message} retry={() => void write.query.refetch()} />}
        {write.key && <Card style={{ gap: 12 }}><Text selectable style={muted}>Mã lần sửa: {write.key}</Text>
          {write.proof ? <><Text accessibilityRole="header" style={{ ...text, fontSize: 20, fontWeight: '700' }}>Đã ghi nhận sửa tiền / ngày thuê</Text><Text style={text}>Hồ sơ #{write.proof.receipt.id} · Phiên bản {write.proof.receipt.revision}</Text><Text style={muted}>Kết quả xác nhận lần gửi; tiền/ngày trên hồ sơ có thể đã được sửa tiếp.</Text><Button label="Đã xem kết quả, mở hồ sơ" loading={write.busy} onPress={() => void write.acknowledge(disablePrevention)} /></> : <><Text style={text}>Đối chiếu lần sửa đã gửi trước khi tiếp tục.</Text><Button label="Đối chiếu kết quả sửa tiền / ngày thuê" loading={write.busy} onPress={() => void write.resolve()} /></>}
        </Card>}
        {profile && !write.key && <>
          <RentalTermsForm key={`${profile.revision}:${formEpoch}`} initial={profile} disabled={write.busy} onDirty={setDirty} onReview={input => { setReview(input); Keyboard.dismiss(); }} />
          <Button secondary label="Tải lại tiền / ngày thuê mới nhất" disabled={write.busy || write.query.isFetching} onPress={() => setReload(true)} />
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
    {review && profile && <ConfirmEdit title="Lưu tiền / ngày thuê đã sửa?" message={`${profile.code} · ${profile.items.find(i => i.id === review.item_id)?.license || `Dòng xe #${review.item_id}`}\n${dateTime(review.start_at)} → ${dateTime(review.end_at)}\nĐơn giá: ${review.unit_price === '' ? 'Giữ đơn giá cũ' : money(Number(review.unit_price))}\nTổng hợp đồng: ${money(profile.total_amount)} → ${money(Number(review.total_amount))}\nĐã thu: ${money(profile.paid_amount)} (giữ theo phiếu)\nLý do: ${review.reason}\n\nChỉ sửa dòng xe đang chọn và tổng hợp đồng. Phiếu/tiền thực nhận, thời điểm trả thực tế và kho giữ theo hồ sơ. Mốc gia hạn liên quan sẽ cập nhật theo lịch mới.`} confirmLabel="Xác nhận sửa tiền / ngày thuê" busy={write.busy} onCancel={() => setReview(null)} onConfirm={() => { const input = review; setReview(null); scroll.current?.scrollTo({ y: 0, animated: false }); void write.save(input); }} />}
    {reload && <ConfirmEdit title="Tải lại tiền / ngày thuê?" message="Nội dung chưa gửi sẽ thay bằng hồ sơ mới nhất." confirmLabel="Tải lại bản mới nhất" onCancel={() => setReload(false)} onConfirm={() => { setReload(false); void write.query.refetch().then(r => { if (r.data?.profile) { setDirty(false); setFormEpoch(v => v + 1); } }); }} />}
    {exit && <ConfirmEdit title="Rời màn sửa tiền / ngày thuê?" message="Nội dung chưa gửi sẽ mất khi rời màn. Mã yêu cầu đã gửi được giữ để đối chiếu trong Tài khoản." confirmLabel="Rời màn sửa tiền / ngày thuê" busy={write.busy} onCancel={() => setExit(null)} onConfirm={() => { if (!write.busy) exit(); }} />}
  </SafeAreaView>;
}
function defaults(initial: MobileRentalTerms, itemId: number): MobileRentalTermsInput {
  const line = initial.items.find(i => i.id === itemId)!;
  return { revision: initial.revision, item_id: line.id, item_revision: line.revision, start_at: line.start_at, end_at: line.end_at, unit_price: line.unit_price === null ? '' : String(line.unit_price), total_amount: String(initial.total_amount), reason: '' };
}
function RentalTermsForm({ initial, disabled, onDirty, onReview }: { initial: MobileRentalTerms; disabled: boolean; onDirty: (value: boolean) => void; onReview: (input: MobileRentalTermsInput) => void }) {
  const theme = useTheme(), [input, setInput] = useState<MobileRentalTermsInput | null>(() => initial.items[0] ? defaults(initial, initial.items[0].id) : null), [pick, setPick] = useState<number | null>(null), [error, setError] = useState('');
  const line = initial.items.find(i => i.id === input?.item_id), text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  const dirty = !!input && JSON.stringify(input) !== JSON.stringify(defaults(initial, input.item_id));
  function change(next: MobileRentalTermsInput) { if (!disabled) { setInput(next); onDirty(JSON.stringify(next) !== JSON.stringify(defaults(initial, next.item_id))); setError(''); } }
  function choose(id: number) { setInput(defaults(initial, id)); onDirty(false); setError(''); }
  function review() {
    Keyboard.dismiss(); if (!input || !line) return;
    if (!validDraftTime(input.start_at) || !validDraftTime(input.end_at) || Date.parse(`${input.end_at}+07:00`) <= Date.parse(`${input.start_at}+07:00`)) { setError('Nhập thời gian hợp lệ; hẹn trả phải sau ngày nhận xe.'); return; }
    if (line.completed_at && Date.parse(`${input.start_at}+07:00`) >= Date.parse(line.completed_at)) { setError('Ngày nhận phải trước thời điểm xe đã thực tế trả.'); return; }
    if (!/^(0|[1-9]\d{0,12})$/.test(input.total_amount) || input.unit_price !== '' && !/^(0|[1-9]\d{0,12})$/.test(input.unit_price)) { setError('Nhập số tiền nguyên VND từ 0 đến 9.999.999.999.999.'); return; }
    if (!input.reason.trim()) { setError('Nhập lý do sửa tiền / ngày thuê.'); return; }
    const baseline = defaults(initial, input.item_id);
    if (['start_at', 'end_at', 'total_amount'].every(k => input[k as keyof typeof input] === baseline[k as keyof typeof baseline]) && (input.unit_price === '' || input.unit_price === baseline.unit_price)) { setError('Tiền và ngày thuê chưa thay đổi.'); return; }
    setError(''); onReview({ ...input, reason: input.reason.trim() });
  }
  return <>
    <Card style={{ gap: 10 }}><Text accessibilityRole="header" style={{ ...text, fontSize: 21, fontWeight: '700' }}>{initial.code}</Text><Text style={text}>Tổng hợp đồng: {money(initial.total_amount)}</Text><Text style={text}>Thuê thực thu theo phiếu: {money(initial.paid_amount)}</Text><Text style={muted}>Điều chỉnh lịch và đơn giá của một dòng xe, cùng tổng hợp đồng. Tổng nhập trực tiếp theo thỏa thuận; không tự tính lại từ số ngày.</Text></Card>
    {input && line ? <>
      <ChoiceField label="Dòng xe sửa tiền / ngày thuê" value={String(input.item_id)} searchable disabled={disabled} choices={initial.items.map(i => ({ value: String(i.id), label: `${i.license || `Xe #${i.vehicle_id}`} · Dòng #${i.id}${i.completed_at ? ' · Đã trả' : ''}` }))} onChange={v => { if (Number(v) !== input.item_id) { if (dirty) setPick(Number(v)); else choose(Number(v)); } }} />
      <Card style={{ gap: 16 }}><Text style={text}>{line.license || `Xe #${line.vehicle_id}`}{line.completed_at ? ` · Đã trả thực tế ${dateTime(line.completed_at)}` : ' · Chưa ghi trả xe'}</Text>
        <RentalDateTime label="nhận xe cần sửa" value={input.start_at} disabled={disabled} onChange={start_at => change({ ...input, start_at })} />
        <RentalDateTime label="hẹn trả cần sửa" value={input.end_at} disabled={disabled} onChange={end_at => change({ ...input, end_at })} />
        <FormField label="Đơn giá dòng xe (VND)" value={input.unit_price} keyboardType="number-pad" maxLength={13} editable={!disabled} onChangeText={unit_price => change({ ...input, unit_price })} hint="Để trống để giữ đơn giá cũ; 0 là sửa đơn giá về 0." />
        <FormField label="Tổng tiền hợp đồng sau sửa (VND)" value={input.total_amount} keyboardType="number-pad" maxLength={13} editable={!disabled} onChangeText={total_amount => change({ ...input, total_amount })} hint={money(Number(input.total_amount || 0))} />
      </Card>
      <FormField label="Lý do sửa tiền / ngày thuê" value={input.reason} multiline maxLength={500} editable={!disabled} onChangeText={reason => change({ ...input, reason })} />
      {!!error && <InlineError message={error} />}<Button label="Kiểm tra tiền / ngày thuê đã sửa" disabled={disabled} onPress={review} />
    </> : <StateView title="Hợp đồng chưa có dòng xe để sửa" />}
    {pick !== null && <ConfirmEdit title="Chuyển sang dòng xe khác?" message="Nội dung chưa gửi của dòng xe đang sửa sẽ bỏ. Mỗi lần lưu điều chỉnh một dòng xe và tổng hợp đồng." confirmLabel="Chuyển dòng xe" onCancel={() => setPick(null)} onConfirm={() => { choose(pick); setPick(null); }} />}
  </>;
}
