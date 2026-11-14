import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, usePreventRemove } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { MobileContractDraft, MobileDraftCustomer } from '@himoto/mobile-contract';
import type { MobileContractEditInput } from '../../../shared/mobile-contract-edit';
import { issuedContractStatuses } from '../../../shared/mobile-contract-edit';
import { useSession } from '@/providers/session';
import { dateTime, money, useTheme } from '@/theme';
import { useContractEditWrite } from '@/hooks/use-contract-edit-write';
import { addDraftVehicle, changeDraftTime, chooseDraftCustomer, chooseDraftType, draftSteps } from '@/lib/draft-form';
import { contextualStatusLabel } from '@/lib/catalogue-config';
import { Button, Card, InlineError, StateView } from './ui';
import { ChoiceField, FormField, KeyboardScrollContext } from './form-fields';
import { DateField } from './date-field';
import { RentalDateTime } from './rental-date-time';
import { ConfirmEdit } from './editor-sheet';
import { DraftCustomerPicker, DraftVehiclePicker } from './draft-pickers';
import { CustomerCreateSheet } from './customer-editor';
import { DraftFees, DraftParty, DraftPeople, DraftRequirements, DraftSection, DraftVehicleLines } from './draft-document-fields';

export function ContractEditEditor({ id }: { id: string }) {
  const write = useContractEditWrite(id), theme = useTheme();
  const [input, setInput] = useState<MobileContractEditInput | null>(null);
  const [step, setStep] = useState(0), [confirm, setConfirm] = useState(false), [reload, setReload] = useState(false);
  const [customerPicker, setCustomerPicker] = useState(false), [vehiclePicker, setVehiclePicker] = useState(false), [customerCreate, setCustomerCreate] = useState(false);
  const [pendingCustomer, setPendingCustomer] = useState<MobileDraftCustomer | null>(null), [localError, setLocalError] = useState('');
  const [exit, setExit] = useState<(() => void) | null>(null);
  const { api, session } = useSession(), scroll = useRef<ScrollViewInstance>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', e => setKeyboardHeight(e.endCoordinates?.height || 300));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const scrollInputIntoView = useCallback((target: any) => {
    if (!target) return;
    setTimeout(() => {
      try { (scroll.current as any)?.scrollResponderScrollNativeHandleToKeyboard?.(target, 140, true); } catch {}
    }, 80);
  }, []);
  useEffect(() => { if (write.key || write.error) { scroll.current?.scrollTo({ y: 0, animated: false }); AccessibilityInfo.announceForAccessibility(write.error || 'Kiểm tra kết quả lần sửa hợp đồng.'); } }, [write.key, write.error]);
  const profile = write.query.data?.profile, options = write.query.data?.options;
  // Retain in-memory edits across a cancelled request resolution and refetch.
  const value = input || profile?.input, d = value?.draft;
  const dirty = !!input && JSON.stringify(input) !== JSON.stringify(profile?.input);
  const disablePrevention = usePreventRemove(write.busy || dirty && !write.proof, ({ repeat }) => setExit(() => repeat));
  const staff = useQuery({ queryKey: ['draft-staff', session?.user.id], queryFn: ({ signal }) => api!.draftStaff(signal), enabled: !!api && !!value && step === 0, staleTime: 60000, gcTime: 60000 });
  const disabled = write.busy || !!write.key || !!pendingCustomer || customerCreate;
  function change(next: MobileContractEditInput) { if (!disabled) { setInput(next); setLocalError(''); } }
  const set = <K extends keyof MobileContractDraft>(key: K, field: MobileContractDraft[K]) => { if (value) change({ ...value, draft: { ...value.draft, [key]: field } }); };
  function jump(next: number) { Keyboard.dismiss(); setStep(next); scroll.current?.scrollTo({ y: 0, animated: false }); AccessibilityInfo.announceForAccessibility(`Bước ${next + 1}: ${draftSteps[next]}`); }
  const text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  const types = options?.types || [];
  const typeChoices = types.filter(t => t.active || t.id === d?.contract_type_id).map(t => ({ value: t.id, label: `${t.label}${t.active ? '' : ' (đã ẩn)'}` }));
  if (d?.contract_type_id && !typeChoices.some(t => t.value === d.contract_type_id)) typeChoices.push({ value: d.contract_type_id, label: d.contract_type_name || `Loại đã lưu ${d.contract_type_id}` });
  const stores = options ? [...options.stores] : [];
  if (d?.store_id && !stores.some(s => String(s.id) === d.store_id)) stores.push({ id: Number(d.store_id), name: `Cơ sở đã lưu #${d.store_id}` });
  const props = value ? { input: value, change, disabled, errors: {} } : null;
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
    <Stack.Screen options={{ title: profile ? `Sửa ${profile.code}` : 'Sửa hợp đồng đã phát hành' }} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <KeyboardScrollContext.Provider value={scrollInputIntoView}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 18, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center', paddingBottom: keyboardHeight > 0 ? keyboardHeight + 80 : 280 }} automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
        <Text accessibilityRole="header" style={{ ...text, fontSize: 24, lineHeight: 32, fontWeight: '800' }}>Sửa đầy đủ hợp đồng</Text>
        {!!(write.error || write.query.error || localError) && <InlineError message={localError || write.error || write.query.error?.message || 'Chưa tải được hợp đồng.'} />}
        {!!write.notice && <Text accessibilityLiveRegion="polite" style={text}>{write.notice}</Text>}
        {write.query.isPending && <StateView title="Đang tải hồ sơ và kiểm tra lần sửa trước" loading />}
        {write.query.isError && <Button secondary label="Tải lại hồ sơ" disabled={write.busy} onPress={() => void write.query.refetch()} />}
        {write.key && <Card style={{ gap: 14 }}>
          <Text accessibilityRole="header" style={{ ...text, fontSize: 20, fontWeight: '700' }}>{write.proof ? 'Đã ghi nhận lần sửa hợp đồng' : 'Cần đối chiếu lần sửa trước'}</Text>
          <Text selectable style={muted}>Mã lần sửa: {write.key}</Text>
          {write.proof ? <><Text style={text}>Hợp đồng #{write.proof.receipt.id} · phiên bản ghi nhận {write.proof.receipt.revision}.</Text><Text style={muted}>Hồ sơ có thể đã được sửa tiếp trên web. Mở hồ sơ để xem trạng thái hiện tại.</Text><Button label="Đã kiểm tra, mở hợp đồng" loading={write.busy} onPress={() => void write.acknowledge(disablePrevention)} /></> : <><Text style={text}>Nếu đã ghi, mở kết quả gốc. Nếu chưa ghi, khóa mã cũ trước khi cho lưu lại.</Text><Button label="Đối chiếu lần sửa trước" loading={write.busy} onPress={() => void write.resolve()} /></>}
        </Card>}
        {value && d && props && options && <>
          <Card style={{ gap: 12, borderColor: theme.warning }}>
            <Text style={text}>Lưu sẽ ghi đè nội dung mới nhất của hợp đồng, kể cả thay đổi được người khác lưu sau khi mở màn này. Kiểm tra cả 5 phần trước khi xác nhận.</Text>
            <Text style={muted}>Có thể lưu hồ sơ còn thiếu thông tin. Tiền thực nhận theo phiếu được giữ. Sửa hợp đồng sẽ xóa duyệt thuê sở hữu hiện tại.</Text>
          </Card>
          <ChoiceField label="Phần đang sửa" value={String(step)} disabled={write.busy} choices={draftSteps.map((name, i) => ({ value: String(i), label: `${i + 1}. ${name}` }))} onChange={v => jump(Number(v))} />
          <Text accessibilityRole="header" style={{ ...text, fontSize: 22, fontWeight: '700' }}>{step + 1}. {draftSteps[step]}</Text>
          {step === 0 && <>
            <DraftSection title="Hợp đồng và cơ sở">
              <ChoiceField label="Loại hợp đồng" value={d.contract_type_id || ''} choices={typeChoices} disabled={disabled} onChange={id => { const type = types.find(t => t.id === id); if (type) change(chooseDraftType(value, type)); }} />
              <ChoiceField label="Trạng thái hợp đồng" value={value.status} disabled={disabled} choices={issuedContractStatuses.map(status => ({ value: status, label: contextualStatusLabel('contracts', status) || status }))} onChange={status => change({ ...value, status })} />
              <Text style={muted}>Trạng thái là nhãn điều chỉnh hồ sơ. Tiền và kho vẫn xử lý theo quy trình nghiệp vụ của hợp đồng.</Text>
              <ChoiceField label="Cơ sở ghi nhận hợp đồng" value={d.store_id} choices={stores.map(s => ({ value: String(s.id), label: s.name }))} disabled={disabled || !session?.user.allStores} onChange={v => set('store_id', v)} searchable />
              <ChoiceField label="Cơ sở xe / nhân sự" value={d.vehicle_store_id || d.store_id} choices={options.vehicleStores.map(s => ({ value: String(s.id), label: s.name }))} disabled={disabled} onChange={v => set('vehicle_store_id', v)} searchable />
              <FormField label="Số hợp đồng giấy" value={d.contract_number} editable={!disabled} maxLength={32} onChangeText={v => set('contract_number', v)} />
            </DraftSection>
            {staff.isError && <InlineError message="Chưa tải được nhân sự. Có thể giữ thông tin hiện tại hoặc nhập tên." />}
            <DraftPeople input={value} change={change} disabled={disabled} staff={staff.data?.rows || []} stores={options.vehicleStores} />
            <DraftRequirements {...props} />
            <DraftSection title="Ngày hồ sơ">
              <DateField label="Ngày ký hợp đồng" value={d.signed_on} disabled={disabled} onChange={v => set('signed_on', v)} />
              <DateField label="Ngày tạo / nhập hợp đồng" value={d.created_on} disabled={disabled} onChange={v => set('created_on', v)} />
              {d.backfill && <><ChoiceField label="Tình trạng thực tế của hợp đồng lịch sử" value={d.backfill.returned_at === undefined ? 'ongoing' : 'returned'} choices={[{ value: 'ongoing', label: 'Khách còn đang thuê' }, { value: 'returned', label: 'Khách đã trả xe từ trước' }]} disabled={disabled} onChange={v => set('backfill', { note: d.backfill!.note, ...(v === 'returned' ? { returned_at: '' } : {}) })} /><FormField label="Lý do nhập bổ sung" value={d.backfill.note} editable={!disabled} multiline maxLength={1000} onChangeText={v => set('backfill', { ...d.backfill!, note: v })} />{d.backfill.returned_at !== undefined && <RentalDateTime label="trả xe thực tế" value={d.backfill.returned_at} disabled={disabled} onChange={v => set('backfill', { ...d.backfill!, returned_at: v })} />}</>}
            </DraftSection>
          </>}
          {step === 1 && <>
            {session?.user.permissions.includes('customers.read') && <Button secondary label="Chọn hồ sơ khách" disabled={disabled} onPress={() => setCustomerPicker(true)} />}
            {session?.user.permissions.includes('customers.read') && session.user.permissions.includes('customers.write') && <Button secondary label="Thêm khách trong hợp đồng" disabled={disabled} onPress={() => setCustomerCreate(true)} />}
            <DraftParty {...props} />
          </>}
          {step === 2 && <>
            <DraftSection title="Thời gian thuê">
              <RentalDateTime label="nhận xe" value={d.start_date} disabled={disabled} onChange={v => change(changeDraftTime(value, 'start_date', v))} />
              <RentalDateTime label="hẹn trả xe" value={d.end_date} disabled={disabled} onChange={v => change(changeDraftTime(value, 'end_date', v))} />
              <Text style={muted}>Giữ nguyên dòng xe đã trả và lịch riêng khi không đổi lịch chung. Thêm hoặc bỏ xe sẽ cập nhật dòng xe và kho theo trạng thái hợp đồng.</Text>
            </DraftSection>
            <Button secondary label="Thêm / thay xe" disabled={disabled || d.vehicles.filter(v => v.id).length >= 50} onPress={() => setVehiclePicker(true)} />
            <DraftVehicleLines {...props} />
          </>}
          {step === 3 && <><DraftFees {...props} /><Card style={{ gap: 10 }}><Text style={text}>Tiền thuê đã thu theo phiếu: {money(profile?.rentalPaid ?? null)}</Text><Text style={text}>Tiền cọc đã thu theo phiếu: {money(profile?.depositPaid ?? null)}</Text><Text style={muted}>Sửa đơn giá, tổng hoặc cọc hợp đồng không ghi đè số tiền thực nhận. Thu/chi điều chỉnh tại luồng phiếu.</Text></Card></>}
          {step === 4 && <>
            <DraftSection title="Ký kết và ghi chú">
              <DateField label="Ngày ủy quyền" value={d.authorization_date} disabled={disabled} onChange={v => set('authorization_date', v)} />
              <FormField label="Ghi chú hợp đồng" value={value.notes} editable={!disabled} multiline maxLength={4000} onChangeText={notes => change({ ...value, notes })} />
            </DraftSection>
            <DraftSection title="Kiểm tra trước khi lưu">
              <Text style={text}>{d.contract_number || 'Chưa có số hợp đồng'} · {contextualStatusLabel('contracts', value.status)}</Text>
              <Text style={text}>Khách: {d.customer.name || 'Chưa nhập'} · Cơ sở: {stores.find(s => String(s.id) === d.store_id)?.name || d.store_id}</Text>
              <Text style={text}>{dateTime(d.start_date)} → {dateTime(d.end_date)}</Text>
              {d.vehicles.filter(v => v.id).map((v, i) => <Text key={`${v.id}:${i}`} style={text}>Xe #{v.id}: {v.license} · {v.name}</Text>)}
              <Text style={text}>Đơn giá: {money(Number(d.unit_price || 0))} · Tổng: {money(Number(d.total_amount || 0))} · Cọc: {money(Number(d.deposit_amount || 0))}</Text>
              <Text style={muted}>Dữ liệu và thay đổi tiền/kho được lưu cùng lịch sử người sửa. Giấy tờ/ảnh đã lưu xem tại hồ sơ hợp đồng.</Text>
            </DraftSection>
          </>}
          <Button secondary label="Tải lại bản mới nhất trước khi sửa" disabled={disabled || write.query.isFetching} onPress={() => setReload(true)} />
        </>}
      </ScrollView>
      {value && !write.key && <View style={{ padding: 16, gap: 10, backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>{step > 0 && <View style={{ flex: 1 }}><Button secondary label="Bước trước" disabled={write.busy} onPress={() => jump(step - 1)} /></View>}{step < 4 && <View style={{ flex: 1 }}><Button secondary label="Tiếp theo" disabled={write.busy} onPress={() => jump(step + 1)} /></View>}</View>
        <Button label="Kiểm tra và lưu hợp đồng" loading={write.busy} disabled={disabled || write.query.isError || write.query.isFetching} onPress={() => { Keyboard.dismiss(); setConfirm(true); }} />
      </View>}
      </KeyboardScrollContext.Provider>
    </KeyboardAvoidingView>
    {confirm && value && <ConfirmEdit title="Ghi đè hợp đồng đã phát hành?" message={`${value.draft.contract_number || `Hợp đồng #${id}`}\n${value.draft.customer.name || 'Chưa nhập tên khách'}\n${value.draft.vehicles.filter(v => v.id).map(v => `#${v.id} ${v.license}`).join('\n') || 'Không giữ xe nào'}\nTổng: ${money(Number(value.draft.total_amount || 0))}\nCọc: ${money(Number(value.draft.deposit_amount || 0))}\n\nNội dung cả 5 phần sẽ ghi đè bản mới nhất, có thể gồm thay đổi người khác vừa lưu. Tiền thực nhận theo phiếu được giữ; xe/kho và lịch sử cập nhật theo quy trình web. Duyệt thuê sở hữu sẽ bị xóa.`} confirmLabel="Xác nhận lưu đè hợp đồng" busy={write.busy} onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void write.save(value); }} />}
    {pendingCustomer && value && <ConfirmEdit title="Dùng hồ sơ khách đã chọn?" message={`Thay thông tin khách và người thân bằng hồ sơ ${pendingCustomer.details.name}. Giấy tờ khách không tự sao chép khi sửa hợp đồng.`} confirmLabel="Dùng hồ sơ khách" onCancel={() => setPendingCustomer(null)} onConfirm={() => { setInput(chooseDraftCustomer(value, pendingCustomer)); setPendingCustomer(null); }} />}
    {customerPicker && <DraftCustomerPicker onClose={() => setCustomerPicker(false)} onPick={row => { setCustomerPicker(false); setPendingCustomer(row); }} />}
    {customerCreate && d && <CustomerCreateSheet storeId={Number(d.store_id) || null} onClose={() => setCustomerCreate(false)} onPick={row => { setCustomerCreate(false); setPendingCustomer(row); }} />}
    {vehiclePicker && options && d && value && <DraftVehiclePicker stores={options.vehicleStores} initialStore={d.vehicle_store_id || d.store_id} selectedIds={d.vehicles.map(v => v.id)} onClose={() => setVehiclePicker(false)} onPick={row => { try { change(addDraftVehicle(value, row)); } catch (cause) { setLocalError((cause as Error).message); } setVehiclePicker(false); }} />}
    {reload && <ConfirmEdit title="Tải lại hợp đồng mới nhất?" message="Nội dung đang sửa sẽ được thay bằng hồ sơ mới nhất trên máy chủ." confirmLabel="Tải lại hợp đồng" onCancel={() => setReload(false)} onConfirm={() => { setReload(false); void write.query.refetch().then(result => { if (result.data?.profile) { setInput(result.data.profile.input); jump(0); } }); }} />}
    {exit && <ConfirmEdit title={write.busy ? 'Đang lưu hợp đồng' : 'Rời màn sửa hợp đồng?'} message={write.busy ? 'Chờ xác nhận từ máy chủ trước khi rời.' : 'Nội dung chưa gửi sẽ mất khi rời màn. Nếu đã gửi, mã yêu cầu được giữ để đối chiếu từ Tài khoản.'} confirmLabel="Rời màn sửa" busy={write.busy} onCancel={() => setExit(null)} onConfirm={() => { if (!write.busy) exit(); }} />}
  </SafeAreaView>;
}
