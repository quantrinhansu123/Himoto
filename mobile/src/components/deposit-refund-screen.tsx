import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, usePreventRemove } from 'expo-router';
import { uuid } from 'expo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DepositRefundRequest } from '../../../shared/deposit-refunds';
import { PAYMENT_METHODS, vietnamPaymentTime, type PaymentMethod } from '../../../shared/payment-methods';
import { validDraftTime } from '@himoto/mobile-draft-validation';
import { ApiError } from '@/lib/api';
import { contractReturnOperations, lookupContractReturnPending } from '@/lib/contract-return-pending';
import { pendingWrites } from '@/lib/pending-writes';
import { selectRecordMediaPhoto, type RecordMediaPhoto } from '@/lib/record-media-photo';
import { supportFormData } from '@/lib/support-form-data';
import { useSession } from '@/providers/session';
import { dateTime, money, useTheme } from '@/theme';
import { BillPhoto } from './bill-photo';
import { DepositRefundRequestCard } from './deposit-refund-request-card';
import { ConfirmEdit } from './editor-sheet';
import { ChoiceField, FormField } from './form-fields';
import { KeyboardFormScrollView } from './keyboard-form-scroll-view';
import { RentalDateTime } from './rental-date-time';
import { Button, Card, InlineError, StateView } from './ui';

export function DepositRefundScreen({ id, itemId, event }: { id: string; itemId: string; event?: string }) {
  const { api, session } = useSession();
  const cache = useQueryClient(), theme = useTheme();
  const scope = useMemo(() => ({
    origin: api!.origin, userId: session!.user.id,
    storeId: session!.user.allStores ? null : session!.user.storeId, allStores: session!.user.allStores,
  }), [api, session]);
  const operation = `return.refund:${id}`;
  const pendingKey = ['deposit-refund-pending', scope, operation];
  const query = useQuery({
    queryKey: ['deposit-refund', scope, id, itemId], retry: false,
    queryFn: ({ signal }) => api!.depositRefund(id, itemId, signal),
  });
  const pending = useQuery({
    queryKey: pendingKey, retry: false,
    queryFn: () => lookupContractReturnPending(scope, operation),
  });
  const [replaceId, setReplaceId] = useState(''), [amount, setAmount] = useState<string>();
  const [paidAt, setPaidAt] = useState(vietnamPaymentTime), [reason, setReason] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash'), [accountId, setAccountId] = useState('');
  const [photo, setPhoto] = useState<RecordMediaPhoto|null>(null), [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState(false), [history, setHistory] = useState(false);
  const [exit, setExit] = useState<(() => void)|null>(null);
  const currentPhoto = useRef<RecordMediaPhoto|null>(null);
  const picking = useRef<AbortController|null>(null), running = useRef(false), alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      picking.current?.abort();
      currentPhoto.current?.dispose();
    };
  }, []);
  usePreventRemove(busy || dirty, ({ repeat }) => { if (!running.current) setExit(() => repeat); });

  const data = query.data, intent = pending.data;
  const original = data?.vouchers.find(row => String(row.id) === replaceId);
  const accounts = data?.accounts.filter(row => row.method === method) ?? [];
  const account = accounts.find(row => String(row.id) === accountId) ?? (accounts.length === 1 ? accounts[0] : undefined);
  const max = (data?.held ?? 0) + (original?.amount ?? 0);
  const entered = amount ?? (max > 0 ? String(max) : '');
  const review = Boolean(data?.vouchers.length || data?.review_reason || method !== 'cash' ||
    paidAt.slice(0, 10) !== vietnamPaymentTime().slice(0, 10));
  const waiting = data?.requests.some(row => row.status === 'pending');
  const blocked = data?.blocked_reason || (waiting ? 'Hợp đồng đang có yêu cầu chờ kế toán duyệt.'
    : !data?.can_submit ? 'Tài khoản chưa có quyền bổ sung hoàn cọc ở cơ sở này.' : '');
  const disabled = busy || pending.isPending || pending.isError || !!intent || query.isFetching;
  const action = review ? 'Gửi kế toán duyệt' : 'Ghi phiếu chi hoàn cọc';
  const text = { color: theme.text, lineHeight: 24 };
  const muted = { color: theme.muted, lineHeight: 22 };

  function update(change: () => void) {
    change();
    setDirty(true);
    setError('');
  }

  async function attach(camera: boolean) {
    if (running.current) return;
    const controller = new AbortController();
    picking.current = controller;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const next = await selectRecordMediaPhoto(camera, controller.signal);
      if (!next) return;
      if (!alive.current) { next.dispose(); return; }
      currentPhoto.current?.dispose();
      currentPhoto.current = next;
      update(() => setPhoto(next));
    } catch (cause) {
      if (alive.current) setError((cause as Error).message);
    } finally {
      picking.current = null;
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }

  function validate() {
    if (!/^[1-9]\d{0,12}$/.test(entered) || Number(entered) > max) return 'Nhập số tiền dương trong số cọc còn được hoàn.';
    if (!account) return 'Chọn két hoặc tài khoản đã chi hoàn cọc.';
    if (!validDraftTime(paidAt)) return 'Nhập đầy đủ ngày giờ chi thực tế.';
    if (!reason.trim()) return 'Nhập lý do bổ sung hoặc sửa phiếu chi.';
    if (!photo) return 'Chọn ảnh chứng từ hoàn cọc.';
    return '';
  }

  function refreshBalances() {
    for (const key of ['deposit-refund', 'deposit-refund-queue', 'return-correction-profile', 'record', 'catalogue', 'finance', 'cashbook', 'cashbook-accounts', 'contract-history', 'telegram']) {
      void cache.invalidateQueries({ queryKey: [key] });
    }
  }

  async function accepted(saved: DepositRefundRequest, key: string) {
    if (saved.id !== key || String(saved.order_id) !== id || saved.actor_id !== scope.userId) {
      throw Error('Kết quả hoàn cọc chưa khớp lần gửi. Giữ mã để đối chiếu.');
    }
    await pendingWrites.complete(scope, operation, key);
    cache.setQueryData(pendingKey, null);
    refreshBalances();
    if (!alive.current) return;
    currentPhoto.current?.dispose();
    currentPhoto.current = null;
    setPhoto(null);
    setReason('');
    setAmount(undefined);
    setReplaceId('');
    setDirty(false);
    setHistory(true);
    setNotice(saved.transaction_id ? `Đã ghi phiếu chi #${saved.transaction_id}.`
      : saved.status === 'rejected' ? 'Kế toán đã từ chối yêu cầu. Xem lý do trong lịch sử bên dưới.'
        : 'Đã chuyển yêu cầu tới kế toán trong Sổ quỹ.');
  }

  async function save() {
    if (running.current || disabled || blocked || !photo || !account || validate()) return;
    running.current = true;
    setBusy(true);
    setConfirm(false);
    setError('');
    setNotice('');
    let key: string|undefined, sent = false;
    try {
      const existing = await pendingWrites.reserveExclusive(scope, operation, contractReturnOperations(id), () => uuid.v4().toLowerCase());
      if (existing.operation !== operation) throw Error('Còn thao tác chưa rõ kết quả. Vào Tài khoản để đối chiếu trước khi lưu.');
      cache.setQueryData(pendingKey, existing.key);
      if (!existing.created) return;
      key = existing.key;
      const body = await supportFormData({
        id: key, item_id: itemId, amount: entered, method, account_id: String(account.id), paid_at: paidAt,
        reason: reason.trim(), replaces_id: replaceId, replaces_revision: original?.revision ?? '',
      }, photo, [], 'evidence');
      sent = true;
      await accepted(await api!.saveDepositRefund(id, itemId, body, key), key);
    } catch (cause) {
      if (key && (!sent || cause instanceof ApiError && ['INVALID_REFUND', 'REFUND_CONFLICT', 'NOT_FOUND', 'REQUEST_CANCELLED'].includes(cause.code))) {
        await pendingWrites.complete(scope, operation, key).then(() => {
          cache.setQueryData(pendingKey, null);
          refreshBalances();
        }).catch(() => {});
      }
      if (alive.current) setError((cause as Error).message);
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }

  async function resolve() {
    if (!intent || running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api!.resolveWrite(intent, operation);
      if (result.status === 'committed') await accepted(await api!.depositRefundRequest(intent), intent);
      else {
        await pendingWrites.complete(scope, operation, intent);
        cache.setQueryData(pendingKey, null);
        if (alive.current) setNotice('Chưa ghi yêu cầu. Có thể kiểm tra lại và gửi.');
        refreshBalances();
      }
    } catch (cause) {
      if (alive.current) setError((cause as Error).message);
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }

  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
    <Stack.Screen options={{ title: data ? `Bổ sung hoàn cọc · ${data.code}` : 'Bổ sung hoàn cọc' }} />
    <KeyboardFormScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
      {!!notice && <Text style={text} accessibilityLiveRegion="polite">{notice}</Text>}
      {!!error && (!data || intent || blocked) && <InlineError message={error} />}
      {pending.isError && <>
        <StateView title="Chưa kiểm tra được mã lần lưu trước" message={pending.error.message} retry={() => { void pending.refetch(); }} />
        <Button secondary label="Mở thao tác cần đối chiếu" onPress={() => router.push('/(tabs)/account')} />
      </>}
      {!!intent && <Card style={{ gap: 10 }}>
        <Text style={text} selectable>Mã yêu cầu {intent}</Text>
        <Button label="Đối chiếu yêu cầu hoàn cọc" loading={busy} onPress={() => { void resolve(); }} />
      </Card>}
      {query.isPending && <StateView title="Đang đối chiếu tiền cọc và phiếu chi" loading />}
      {query.isError && <StateView title="Chưa tải được hồ sơ hoàn cọc" message={query.error.message} retry={() => { void query.refetch(); }} />}
      {data && <>
        <Card style={{ gap: 10 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Cọc còn giữ {money(data.held)}</Text>
          {data.vouchers.map(row => <Text key={row.id} style={text}>
            Phiếu #{row.id} · {money(row.amount)} · {row.method}{row.account ? ` · ${row.account}` : ''} · {dateTime(row.paid_at)}
          </Text>)}
          {data.can_send_telegram && data.vouchers.length > 0 &&
            <Button secondary label="Xem trước Telegram trả xe" disabled={busy || !!intent}
              onPress={() => router.push({ pathname: '/contract-telegram/[id]', params: { id, eventKind: 'return', returnItemId: itemId, ...(event ? { event } : {}) } })} />}
        </Card>
        {data.requests.length > 0 && <>
          <Button secondary label={history ? 'Ẩn lịch sử hoàn cọc' : `Yêu cầu hoàn cọc (${data.requests.length})`}
            onPress={() => setHistory(value => !value)} />
          {history && data.requests.map(row => <DepositRefundRequestCard key={row.id} row={row} />)}
        </>}
        {!!blocked && <Text style={muted}>{blocked}</Text>}
        {!blocked && !intent && <Card style={{ gap: 16 }}>
          {data.vouchers.length > 0 && <ChoiceField label="Thao tác hoàn cọc" value={replaceId}
            choices={[
              { value: '', label: data.held > 0 ? 'Bổ sung phần cọc còn giữ' : 'Chọn phiếu chi cần sửa' },
              ...data.vouchers.map(row => ({ value: String(row.id), label: `Sửa phiếu #${row.id} · ${money(row.amount)}` })),
            ]} disabled={disabled} onChange={value => update(() => { setReplaceId(value); setAmount(undefined); })} />}
          {max <= 0 && <Text style={muted}>Chọn phiếu chi cần sửa để tiếp tục.</Text>}
          <FormField label="Số tiền đã hoàn (VNĐ)" value={entered} maxLength={13} keyboardType="number-pad" editable={!disabled}
            onChangeText={value => update(() => setAmount(value.replace(/\D/g, '')))} />
          <ChoiceField label="Hình thức hoàn cọc" value={method} choices={PAYMENT_METHODS.map(row => ({ ...row }))}
            disabled={disabled} onChange={value => update(() => { setMethod(value as PaymentMethod); setAccountId(''); })} />
          <ChoiceField label="Két hoặc tài khoản đã chi" value={account ? String(account.id) : ''} placeholder="Chọn nguồn đã chi"
            choices={accounts.map(row => ({ value: String(row.id), label: row.label }))}
            disabled={disabled || !accounts.length} onChange={value => update(() => setAccountId(value))} searchable />
          {!accounts.length && <Text style={muted}>Chưa có két hoặc tài khoản hoạt động cho hình thức này.</Text>}
          <RentalDateTime label="chi hoàn cọc thực tế" value={paidAt} disabled={disabled} onChange={value => update(() => setPaidAt(value))} />
          <FormField label="Lý do bổ sung hoặc sửa phiếu" value={reason} multiline maxLength={500} editable={!disabled}
            onChangeText={value => update(() => setReason(value))} />
          {photo && <BillPhoto label="Ảnh chứng từ hoàn cọc đã chọn" context="chứng từ hoàn cọc" source={{ uri: photo.uri }} />}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button equalWidth secondary label="Chụp chứng từ" disabled={disabled} onPress={() => { void attach(true); }} />
            <Button equalWidth secondary label="Chọn ảnh chứng từ" disabled={disabled} onPress={() => { void attach(false); }} />
          </View>
          {review && <Text style={muted}>{data.review_reason || 'Khoản này cần kế toán duyệt trong Sổ quỹ.'}</Text>}
          {!!error && <InlineError message={error} />}
          <Button label={action} loading={busy} disabled={disabled || max <= 0 || !accounts.length} onPress={() => {
            Keyboard.dismiss();
            const message = validate();
            setError(message);
            if (!message) setConfirm(true);
          }} />
        </Card>}
        <Button secondary label="Tải lại hồ sơ hoàn cọc" loading={query.isRefetching} disabled={busy} onPress={() => { void query.refetch(); }} />
      </>}
    </KeyboardFormScrollView>
    {confirm && <ConfirmEdit title={`${action}?`}
      message={`HĐ ${data?.code} · ${money(Number(entered))}\n${account?.label} · ${dateTime(`${paidAt}:00+07:00`)}\n${original ? `Sửa phiếu chi #${original.id}\n` : ''}${reason.trim()}`}
      confirmLabel={action} onCancel={() => setConfirm(false)} onConfirm={() => { void save(); }} />}
    {exit && <ConfirmEdit title="Rời hồ sơ hoàn cọc?" message="Thông tin đang nhập và ảnh chưa lưu sẽ mất khi rời màn hình."
      confirmLabel="Rời hồ sơ hoàn cọc" onCancel={() => setExit(null)} onConfirm={() => { setExit(null); exit(); }} />}
  </SafeAreaView>;
}
