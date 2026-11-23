import { useState } from 'react';
import { Keyboard, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  BATTERY_SWAP_FEE, BATTERY_SWAP_LOW_PERCENT, CONTRACT_OPERATIONS, CONTRACT_OPERATION_PERMISSIONS, isContractOperation, type ContractOperation,
  type ContractOperationAccount, type ContractOperationContext, type ContractOperationInput,
  type ContractSettlementMode, type ContractSettlementVehicle,
} from '../../../../../shared/mobile-contract-operations';
import { PAYMENT_METHODS, vietnamPaymentTime, type PaymentMethod } from '../../../../../shared/payment-methods';
import { validDraftTime } from '@himoto/mobile-draft-validation';
import { Button, Card, InlineError, KeyValueRow, StateView, StatusBadge } from '@/components/ui';
import { ChoiceField, FormField } from '@/components/form-fields';
import { KeyboardFormScrollView } from '@/components/keyboard-form-scroll-view';
import { RentalDateTime } from '@/components/rental-date-time';
import { ConfirmEdit } from '@/components/editor-sheet';
import { useContractOperation } from '@/hooks/use-contract-operation';
import { useSession } from '@/providers/session';
import { dateTime, money, useTheme } from '@/theme';

type Write = ReturnType<typeof useContractOperation>;
type Context<T extends ContractOperation> = Extract<ContractOperationContext, { action: T }>;

function PaymentFields({ method, onMethod, account, onAccount, accounts, at, onAt, disabled }: {
  method: PaymentMethod; onMethod: (value: PaymentMethod) => void; account: string; onAccount: (value: string) => void;
  accounts: ContractOperationAccount[]; at: string; onAt: (value: string) => void; disabled: boolean;
}) {
  const choices = accounts.filter(row => row.method === method).map(row => ({ value: String(row.id), label: row.label }));
  return <>
    <ChoiceField label="Hình thức thanh toán" choices={PAYMENT_METHODS.map(row => ({ ...row }))} value={method}
      disabled={disabled} onChange={value => { onMethod(value as PaymentMethod); onAccount(''); }} />
    <ChoiceField label="Tài khoản hoặc két nhận" value={account || (choices.length === 1 ? choices[0].value : '')} choices={choices}
      placeholder={choices.length ? 'Chọn tài khoản đã nhận' : 'Chưa có tài khoản phù hợp'} disabled={disabled || !choices.length}
      onChange={onAccount} searchable />
    <RentalDateTime label="thu thực tế" value={at} disabled={disabled} onChange={onAt} />
  </>;
}

function Reservation({ data, write }: { data: Context<'no_show' | 'delete_reservation'>; write: Write }) {
  const theme = useTheme(), [reason, setReason] = useState(''), [confirm, setConfirm] = useState(false);
  const deletion = data.action === 'delete_reservation';
  const label = deletion ? 'Xóa hợp đồng cọc' : 'Chốt khách không đến';
  return <Card style={{ gap: 14 }}>
    <View style={{ gap: 2 }}>
      <KeyValueRow label="Tiền giữ xe đã nhận" value={money(data.paid)} emphasize />
      {!!data.appointment && <KeyValueRow label="Hẹn nhận xe" value={dateTime(data.appointment)} />}
    </View>
    <Text style={{ color: theme.muted, lineHeight: 22 }}>{deletion
      ? 'Ẩn hợp đồng giữ xe, giải phóng xe đủ điều kiện và giữ các phiếu đã ghi trong Sổ quỹ.'
      : 'Khoản giữ xe đã nhận được tính vào doanh thu cơ sở. Hệ thống đóng hợp đồng và giải phóng xe đủ điều kiện.'}</Text>
    {data.blocked_reason ? <InlineError message={data.blocked_reason} /> : <>
      {!deletion && <FormField label="Lý do / đối chiếu với khách" value={reason} onChangeText={setReason}
        multiline maxLength={1000} editable={!write.locked} />}
      <Button label={label} danger={deletion} disabled={write.locked} onPress={() => { Keyboard.dismiss(); setConfirm(true); }} />
    </>}
    {confirm && <ConfirmEdit title={`${label}?`}
      message={`HĐ ${data.code} · ${money(data.paid)}\n${deletion
        ? 'Xác nhận ẩn hợp đồng và giữ các phiếu đã ghi trong Sổ quỹ.'
        : 'Xác nhận khách không đến và khoản tiền giữ xe được giữ lại theo thỏa thuận.'}`}
      confirmLabel={label} onCancel={() => setConfirm(false)} onConfirm={() => {
        setConfirm(false);
        void write.save({ revision: data.revision, ...(deletion ? {} : { reason: reason.trim() }) });
      }} />}
  </Card>;
}

function Swap({ data, write, initialSwap }: { data: Context<'battery_swap'>; write: Write; initialSwap?: string }) {
  const theme = useTheme(), id = String(data.id);
  const [item, setItem] = useState(''), [selected, setSelected] = useState(initialSwap ?? '');
  const target = data.items.find(row => String(row.id) === item) ?? data.items[0];
  const swap = data.swaps.find(row => String(row.id) === (write.receipt?.revision ?? selected));
  const eligible = swap && data.items.some(row => row.id === swap.item_id);
  return <>
    {swap ? <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>Lượt #{swap.id} · {swap.license}</Text>
        <StatusBadge status={swap.status === 'confirmed' ? 'completed' : 'draft'} label={swap.status === 'confirmed' ? 'Đã xác nhận' : 'Bản nháp'} />
      </View>
      <Button secondary label="Ảnh biển số, pin và video đổi pin" disabled={write.busy}
        onPress={() => router.push({ pathname: '/record-media/[entity]/[id]', params: { entity: 'contracts', id, kind: 'battery_swap', referenceId: String(swap.id) } })} />
      {swap.status === 'confirmed' ? <>
        <View style={{ gap: 2 }}>
          <KeyValueRow label="Phần trăm pin" value={`${swap.battery_percent}%`} />
          <KeyValueRow label="Phí đổi pin" value={money(swap.fee)} emphasize />
          <KeyValueRow label="Xác nhận lúc" value={dateTime(swap.confirmed_at ?? '')} />
        </View>
        <Button label="Kiểm tra và gửi Telegram đổi pin" disabled={write.busy}
          onPress={() => router.push({ pathname: '/contract-telegram/[id]', params: { id, event: `battery-swap:${id}:${swap.id}`, onlyEvent: '1' } })} />
      </> : data.can_write && eligible ? <SwapForm key={swap.id} data={data} swap={swap} write={write} />
        : <Text style={{ color: theme.muted }}>Lượt đổi pin đang ở chế độ xem. Kiểm tra xe còn thuê và quyền gia hạn.</Text>}
      <Button secondary label="Về danh sách lượt đổi pin" disabled={write.busy} onPress={() => { setSelected(''); write.clearReceipt(); }} />
    </Card> : <>
      {data.can_write && target && <Card style={{ gap: 12 }}>
        <ChoiceField label="Xe cần đổi pin" value={String(target.id)} choices={data.items.map(row => ({ value: String(row.id), label: `${row.license} · ${row.name}` }))}
          disabled={write.locked} onChange={setItem} />
        <Button label="Ghi nhận lượt đổi pin" disabled={write.locked} onPress={() => { void write.save({ action: 'prepare', item_id: target.id }); }} />
      </Card>}
      {!data.items.length && <Text style={{ color: theme.muted, lineHeight: 24 }}>Có thể đổi pin cho xe điện hoặc xe có hợp đồng pin liên kết đang thuê.</Text>}
      {data.swaps.map(row => <Card key={row.id} style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: theme.text, fontWeight: '700' }}>Lượt #{row.id} · {row.license}</Text>
          <StatusBadge status={row.status === 'confirmed' ? 'completed' : 'draft'} label={row.status === 'confirmed' ? 'Đã xác nhận' : 'Chưa xác nhận'} />
        </View>
        {row.status === 'confirmed' && <KeyValueRow label="Pin & phí" value={`${row.battery_percent}% · Phí ${money(row.fee)}`} />}
        <Button secondary label={row.status === 'draft' && data.can_write ? 'Tiếp tục lượt đổi pin' : 'Xem lượt đổi pin'} disabled={write.busy}
          onPress={() => { write.clearReceipt(); setSelected(String(row.id)); }} />
      </Card>)}
    </>}
  </>;
}

function SwapForm({ data, swap, write }: { data: Context<'battery_swap'>; swap: Context<'battery_swap'>['swaps'][number]; write: Write }) {
  const theme = useTheme(), [percent, setPercent] = useState(''), [note, setNote] = useState('');
  const [collect, setCollect] = useState(false), [method, setMethod] = useState<PaymentMethod>('cash');
  const [selected, setSelected] = useState(''), [at, setAt] = useState(vietnamPaymentTime);
  const [confirm, setConfirm] = useState<ContractOperationInput>(), [error, setError] = useState('');
  const valid = /^\d{1,3}$/.test(percent) && Number(percent) <= 100;
  const fee = valid && Number(percent) < BATTERY_SWAP_LOW_PERCENT ? BATTERY_SWAP_FEE : 0;
  const accounts = data.accounts.filter(row => row.method === method);
  const account = accounts.find(row => String(row.id) === selected) ?? (accounts.length === 1 ? accounts[0] : undefined);
  function review() {
    Keyboard.dismiss();
    if (!valid || fee && collect && (!account || !validDraftTime(at))) {
      setError('Nhập mức pin từ 0 đến 100 và kiểm tra tài khoản, thời điểm nếu đã thu phí.');
      return;
    }
    setError('');
    setConfirm({
      action: 'confirm', id: swap.id, revision: swap.revision, order_revision: data.revision, battery_percent: Number(percent), note,
      ...(fee && collect && account ? { receipt: { method, account_id: account.id, paid_at: at } } : {}),
    });
  }
  return <>
    <FormField label="Phần trăm pin lúc nhận" value={percent} keyboardType="number-pad" maxLength={3}
      editable={!write.locked} onChangeText={value => setPercent(value.replace(/\D/g, ''))} />
    <Text style={{ color: theme.text }}>Phí đổi pin {valid ? money(fee) : 'theo mức pin thực tế'}</Text>
    {fee > 0 && <>
      <ChoiceField label={`Thu phí pin dưới ${BATTERY_SWAP_LOW_PERCENT}%`} value={collect ? 'yes' : 'no'}
        choices={[{ value: 'no', label: 'Chưa nhận phí' }, { value: 'yes', label: `Đã nhận ${money(fee)}` }]}
        disabled={write.locked} onChange={value => setCollect(value === 'yes')} />
      {collect && <PaymentFields method={method} onMethod={setMethod} account={selected} onAccount={setSelected} accounts={data.accounts}
        at={at} onAt={setAt} disabled={write.locked} />}
    </>}
    <FormField label="Pin giao / nhận, ghi chú" value={note} maxLength={1000} multiline editable={!write.locked} onChangeText={setNote} />
    {!!error && <InlineError message={error} />}
    <Button label="Xác nhận đã đổi pin" disabled={write.locked || !valid} onPress={review} />
    {confirm && <ConfirmEdit title="Xác nhận đã đổi pin?" message={`HĐ ${data.code} · ${swap.license}\nPin lúc nhận ${percent}% · Phí ${money(fee)}${fee ? ` · ${collect ? 'Đã thu' : 'Chưa thu'}` : ''}`}
      confirmLabel="Xác nhận đã đổi pin" onCancel={() => setConfirm(undefined)} onConfirm={() => {
        setConfirm(undefined);
        void write.save(confirm);
      }} />}
  </>;
}

function Settlement({ data, write, initialMode }: { data: Context<'payment_settlement'>; write: Write; initialMode?: ContractSettlementMode }) {
  const theme = useTheme(), id = String(data.id), closed = data.status === 'completed';
  const [mode, setMode] = useState<ContractSettlementMode>(() => (!closed && initialMode && ['partial', 'full', 'close_unpaid'].includes(initialMode) ? initialMode : 'partial'));
  const [amount, setAmount] = useState(''), [method, setMethod] = useState<PaymentMethod>('cash');
  const [selected, setSelected] = useState(''), [at, setAt] = useState(vietnamPaymentTime), [note, setNote] = useState('');
  const [vehicles, setVehicles] = useState<Record<number, ContractSettlementVehicle>>({});
  const [confirm, setConfirm] = useState<ContractOperationInput>(), [error, setError] = useState('');
  const closing = !closed && mode !== 'partial';
  const entered = mode === 'partial' ? amount : mode === 'full' ? String(data.remaining ?? '') : '0';
  const receives = Number(entered) > 0, accounts = data.accounts.filter(row => row.method === method);
  const account = accounts.find(row => String(row.id) === selected) ?? (accounts.length === 1 ? accounts[0] : undefined);
  const title = mode === 'close_unpaid' ? 'Đóng hợp đồng không thu tiền' : closing ? 'Thu đủ và đóng hợp đồng' : 'Ghi nhận thanh toán';
  function review() {
    Keyboard.dismiss();
    const current = data.items.flatMap(row => vehicles[row.id]?.revision === row.revision ? [vehicles[row.id]] : []);
    if (!/^(0|[1-9]\d{0,12})$/.test(entered) || data.remaining === null ||
        mode === 'partial' && (Number(entered) <= 0 || Number(entered) >= data.remaining) ||
        !validDraftTime(at) || receives && !account ||
        closing && (current.length !== data.items.length || current.some(row => row.status === 'returned' && !validDraftTime(row.returned_at)))) {
      setError('Kiểm tra số tiền, ngày giờ, tài khoản nhận và trạng thái thực tế của từng xe.');
      return;
    }
    setError('');
    setConfirm({
      revision: data.revision, mode, amount: entered, paid_at: at, note: note.trim(), confirmed: true,
      ...(receives && account ? { method, account_id: account.id } : {}),
      ...(closing ? { vehicles_confirmed: true, vehicles: current } : {}),
    });
  }
  const text = { color: theme.text, lineHeight: 24 };
  return <>
    <Card style={{ gap: 8 }}>
      <View style={{ gap: 2 }}>
        <KeyValueRow label="Giá trị hợp đồng" value={money(data.total)} />
        <KeyValueRow label="Đã thu" value={money(data.paid)} />
        <KeyValueRow label="Công nợ" value={money(data.remaining)} emphasize />
        <KeyValueRow label="Cọc đang giữ" value={money(data.held)} />
      </View>
      {closed && data.items.length > 0 && <Button secondary label="Ghi nhận xe đã thu hồi"
        onPress={() => router.push({ pathname: '/recovery-editor/[id]', params: { id } })} />}
    </Card>
    {data.blocked_reason ? <InlineError message={data.blocked_reason} /> : <Card style={{ gap: 16 }}>
      <ChoiceField label="Cách thanh toán và đóng hợp đồng" value={mode} choices={[
        { value: 'partial', label: 'Thanh toán một phần' }, { value: 'full', label: closed ? 'Thu toàn bộ công nợ' : 'Thu đủ và đóng hợp đồng' },
        ...(!closed ? [{ value: 'close_unpaid', label: 'Đóng hợp đồng không thu tiền' }] : []),
      ]} disabled={write.locked} onChange={value => setMode(value as ContractSettlementMode)} />
      {mode === 'partial' ? <FormField label="Số tiền thanh toán (VNĐ)" value={amount} maxLength={13} keyboardType="number-pad"
        editable={!write.locked} onChangeText={value => setAmount(value.replace(/\D/g, ''))} />
        : <Text style={text}>Số tiền thu lần này {money(Number(entered))}</Text>}
      {closing && data.items.map(row => <Card key={row.id} style={{ gap: 10 }}>
        <ChoiceField label={`Trạng thái xe ${row.license || row.name}`} value={vehicles[row.id]?.revision === row.revision ? vehicles[row.id].status : ''} placeholder="Chọn trạng thái thực tế"
          choices={[{ value: 'with_customer', label: 'Xe còn ở khách' }, { value: 'returned', label: 'Xe đã trả / thu hồi' }]}
          disabled={write.locked} onChange={status => setVehicles(current => ({ ...current, [row.id]: {
            item_id: row.id, revision: row.revision, status: status as ContractSettlementVehicle['status'], ...(status === 'returned' ? { returned_at: at } : {}),
          } }))} />
        {vehicles[row.id]?.revision === row.revision && vehicles[row.id].status === 'returned' && <RentalDateTime label="trả / thu hồi xe" disabled={write.locked}
          value={vehicles[row.id].returned_at ?? ''} onChange={returned_at => setVehicles(current => ({ ...current, [row.id]: { ...current[row.id], returned_at } }))} />}
      </Card>)}
      {receives ? <PaymentFields method={method} onMethod={setMethod} account={selected} onAccount={setSelected}
        accounts={data.accounts} at={at} onAt={setAt} disabled={write.locked} />
        : <RentalDateTime label="thực hiện" value={at} disabled={write.locked} onChange={setAt} />}
      <FormField label="Ghi chú thanh toán hoặc đóng" value={note} onChangeText={setNote} multiline maxLength={1000} editable={!write.locked} />
      {!!error && <InlineError message={error} />}
      <Button label={title} disabled={write.locked} onPress={review} />
    </Card>}
    {!!confirm && <ConfirmEdit title={`${title}?`} message={`HĐ ${data.code} · ${money(Number(entered))}\n${closing ? 'Xe còn ở khách tiếp tục được theo dõi thu hồi.\n' : ''}${mode === 'close_unpaid' ? 'Công nợ và tiền cọc tiếp tục được theo dõi.' : account?.label ?? ''}`}
      confirmLabel={title} onCancel={() => setConfirm(undefined)} onConfirm={() => { setConfirm(undefined); void write.save(confirm); }} />}
  </>;
}

function Operation({ id, action, swapId, initialMode }: { id: string; action: ContractOperation; swapId?: string; initialMode?: ContractSettlementMode }) {
  const theme = useTheme(), write = useContractOperation(id, action), data = write.query.data;
  const receipt = write.receipt && action !== 'battery_swap';
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
    <Stack.Screen options={{ title: CONTRACT_OPERATIONS[action] }} />
    <KeyboardFormScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
      {!!data && <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 21, fontWeight: '800' }}>HĐ {data.code}</Text>}
      {!!write.error && <InlineError message={write.error} />}
      {!!write.notice && <Text style={{ color: theme.text }} accessibilityLiveRegion="polite">{write.notice}</Text>}
      {write.pending.isError && <StateView title="Chưa kiểm tra được mã lần trước" message={write.pending.error.message} retry={() => { void write.pending.refetch(); }} />}
      {!!write.pending.data && <Card style={{ gap: 10 }}>
        <Text style={{ color: theme.text }} selectable>Mã thao tác {write.pending.data}</Text>
        <Button label="Đối chiếu với máy chủ" loading={write.busy} onPress={() => { void write.resolve(); }} />
      </Card>}
      {receipt ? <Card style={{ gap: 12 }}>
        <Text style={{ color: theme.success, fontWeight: '700' }} accessibilityLiveRegion="polite">Đã ghi nhận {CONTRACT_OPERATIONS[action].toLowerCase()}.</Text>
        <Button label={action === 'delete_reservation' ? 'Về danh sách hợp đồng' : 'Mở hợp đồng'}
          onPress={() => action === 'delete_reservation' ? router.dismissTo('/(tabs)/contracts')
            : router.dismissTo({ pathname: '/record/[kind]/[id]', params: { kind: 'contracts', id } })} />
        {action !== 'delete_reservation' && <Button secondary label="Gửi Telegram hợp đồng"
          onPress={() => router.push({ pathname: '/contract-telegram/[id]', params: { id, ...(action === 'payment_settlement' ? { eventKind: 'return' } : action === 'no_show' ? { eventKind: 'reservation' } : {}) } })} />}
        {action === 'payment_settlement' && <Button secondary label="Xem phiếu thu / chi"
          onPress={() => router.push({ pathname: '/contract-history/[id]', params: { id, tab: 'cashflow' } })} />}
      </Card> : <>
        {write.query.isPending && <StateView title="Đang tải dữ liệu hợp đồng" loading />}
        {write.query.isError && <StateView title="Chưa mở được thao tác" message={write.query.error.message} retry={() => { void write.query.refetch(); }} />}
        {data?.action === 'battery_swap' && <Swap data={data} write={write} initialSwap={swapId} />}
        {data?.action === 'payment_settlement' && <Settlement data={data} write={write} initialMode={initialMode} />}
        {(data?.action === 'no_show' || data?.action === 'delete_reservation') && <Reservation data={data} write={write} />}
        {data && action !== 'delete_reservation' && <Button secondary label="Gửi Telegram hợp đồng" disabled={write.busy}
          onPress={() => router.push({ pathname: '/contract-telegram/[id]', params: { id, ...(action === 'payment_settlement' ? { eventKind: 'return' } : action === 'no_show' ? { eventKind: 'reservation' } : {}) } })} />}
        {data && <Button secondary label="Tải lại dữ liệu" loading={write.query.isRefetching} disabled={write.busy}
          onPress={() => { void write.query.refetch(); }} />}
      </>}
    </KeyboardFormScrollView>
  </SafeAreaView>;
}

export default function Route() {
  const { id, action, swapId, mode } = useLocalSearchParams<{ id: string; action: string; swapId?: string; mode?: string }>(), { api, session } = useSession();
  const permissions = session?.user.permissions ?? [];
  const initialMode: ContractSettlementMode | undefined = mode === 'partial' || mode === 'full' || mode === 'close_unpaid' ? mode : undefined;
  if (!api || !session || !isContractOperation(action) || !/^[1-9]\d{0,14}$/.test(id) || !permissions.includes('contracts.read') ||
      action !== 'battery_swap' && !permissions.includes(CONTRACT_OPERATION_PERMISSIONS[action])) return <StateView title="Không mở được thao tác hợp đồng" />;
  return <Operation key={`${api.origin}:${session.user.id}:${session.user.storeId}:${session.user.allStores}:${id}:${action}:${swapId ?? ''}:${initialMode ?? ''}`}
    id={id} action={action} swapId={swapId} initialMode={initialMode} />;
}
