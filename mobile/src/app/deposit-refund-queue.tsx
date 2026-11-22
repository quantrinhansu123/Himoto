import { useRef, useState } from 'react';
import { Keyboard, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, usePreventRemove } from 'expo-router';
import type { DepositRefundDecision, DepositRefundRequest } from '../../../shared/deposit-refunds';
import { DepositRefundRequestCard } from '@/components/deposit-refund-request-card';
import { ConfirmEdit } from '@/components/editor-sheet';
import { FormField } from '@/components/form-fields';
import { KeyboardFormScrollView } from '@/components/keyboard-form-scroll-view';
import { Button, Card, InlineError, StateView } from '@/components/ui';
import { useSession } from '@/providers/session';
import { money, useTheme } from '@/theme';

function Queue() {
  const { api, session } = useSession();
  const cache = useQueryClient(), theme = useTheme();
  const [page, setPage] = useState(1), [selected, setSelected] = useState<DepositRefundRequest>();
  const [note, setNote] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<DepositRefundDecision>(), [saved, setSaved] = useState<DepositRefundRequest>();
  const running = useRef(false);
  const query = useQuery({
    queryKey: ['deposit-refund-queue', api!.origin, session!.user.id, session!.user.storeId, session!.user.allStores, page],
    queryFn: ({ signal }) => api!.depositRefundQueue(page, signal), retry: false, enabled: !selected,
  });
  usePreventRemove(busy, () => {});
  const text = { color: theme.text, lineHeight: 24 };
  const muted = { color: theme.muted, lineHeight: 22 };
  const own = selected?.actor_id === session!.user.id;

  function review(action: DepositRefundDecision) {
    Keyboard.dismiss();
    if (action === 'reject' && !note.trim()) {
      setError('Nhập lý do từ chối để nhân viên đối chiếu.');
      return;
    }
    setError('');
    setDecision(action);
  }

  function finish(row: DepositRefundRequest) {
    setSaved(row);
    setSelected(undefined);
    setPage(1);
    for (const key of ['deposit-refund', 'deposit-refund-queue', 'return-correction-profile', 'cashbook', 'cashbook-accounts', 'contract-history', 'telegram']) {
      void cache.invalidateQueries({ queryKey: [key] });
    }
  }

  async function submit() {
    if (!selected || !decision || own || running.current) return;
    running.current = true;
    setBusy(true);
    setDecision(undefined);
    setError('');
    try {
      finish(await api!.decideDepositRefund(selected.id, decision, note.trim()));
    } catch (cause) {
      const current = await api!.depositRefundRequest(selected.id).catch(() => null);
      if (current && current.status !== 'pending') finish(current);
      else setError((cause as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  const refresh = () => {
    if (!selected) void query.refetch();
  };
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1 }}>
    <KeyboardFormScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40, width: '100%', maxWidth: 760, alignSelf: 'center' }}
      refreshControl={selected ? undefined : <RefreshControl refreshing={query.isRefetching} onRefresh={refresh} tintColor={theme.primary} />}>
      {selected ? <>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 24, fontWeight: '800' }}>Duyệt hoàn cọc · {selected.code}</Text>
        <DepositRefundRequestCard key={selected.id} row={selected} showPhoto />
        {!!selected.replaces_id && <Text style={muted}>Khi duyệt, hệ thống hủy hiệu lực phiếu #{selected.replaces_id} và ghi phiếu thay thế.</Text>}
        {own
          ? <Text style={muted}>Cần kế toán hoặc quản trị viên khác duyệt yêu cầu do mình gửi.</Text>
          : <FormField label="Ghi chú duyệt hoặc lý do từ chối" value={note} multiline maxLength={500}
              editable={!busy} onChangeText={value => { setNote(value); setError(''); }} />}
        {!!error && <InlineError message={error} />}
        {!own && <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button equalWidth secondary label="Từ chối" disabled={busy} onPress={() => review('reject')} />
          <Button equalWidth label="Duyệt và ghi phiếu chi" loading={busy} onPress={() => review('approve')} />
        </View>}
        <Button secondary label="Về danh sách chờ duyệt" disabled={busy} onPress={() => { setSelected(undefined); setError(''); }} />
      </> : <>
        {!!saved && <Card style={{ gap: 10 }}>
          <Text style={text} accessibilityLiveRegion="polite">{saved.transaction_id
            ? `Đã duyệt yêu cầu HĐ ${saved.code} và ghi phiếu chi #${saved.transaction_id}.`
            : `Yêu cầu hoàn cọc HĐ ${saved.code} đã bị từ chối.`}</Text>
          {!!saved.transaction_id && session!.user.permissions.includes('contracts.return') &&
            <Button secondary label="Xem trước Telegram trả xe" onPress={() => router.push({
              pathname: '/contract-telegram/[id]', params: { id: String(saved.order_id), eventKind: 'return', returnItemId: String(saved.item_id) },
            })} />}
        </Card>}
        {query.isPending && <StateView title="Đang tải yêu cầu hoàn cọc" loading />}
        {query.isError && <StateView title="Chưa tải được danh sách" message={query.error.message} retry={refresh} />}
        {!query.isFetching && query.data?.rows.length === 0 && <StateView title="Không có yêu cầu chờ duyệt" />}
        {query.data?.rows.map(row => <Card key={row.id} style={{ gap: 10 }}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>HĐ {row.code} · {money(row.amount)}</Text>
          <Text style={muted}>{row.store} · {row.actor}{row.review_reason ? ` · ${row.review_reason}` : ''}</Text>
          <Button secondary label={`Xem và duyệt HĐ ${row.code}`} disabled={query.isFetching} onPress={() => {
            setNote(''); setError(''); setSaved(undefined); setSelected(row);
          }} />
        </Card>)}
        {query.data && (page > 1 || query.data.has_more) && <>
          <Text style={muted}>Trang {page}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button equalWidth secondary label="Trang trước" disabled={page === 1 || query.isFetching} onPress={() => setPage(value => value - 1)} />
            <Button equalWidth secondary label="Trang sau" disabled={!query.data.has_more || query.isFetching} onPress={() => setPage(value => value + 1)} />
          </View>
        </>}
      </>}
    </KeyboardFormScrollView>
    {selected && decision && <ConfirmEdit title={decision === 'approve' ? 'Duyệt và ghi phiếu chi?' : 'Từ chối yêu cầu hoàn cọc?'}
      message={`HĐ ${selected.code} · ${money(selected.amount)}\n${selected.account_label}${note.trim() ? `\n${note.trim()}` : ''}`}
      confirmLabel={decision === 'approve' ? 'Duyệt và ghi phiếu chi' : 'Xác nhận từ chối'} onCancel={() => setDecision(undefined)}
      onConfirm={() => { void submit(); }} />}
  </SafeAreaView>;
}

export default function Route() {
  const { api, session } = useSession();
  if (!api || !session || !session.user.permissions.includes('finance.write')) {
    return <StateView title="Không có quyền duyệt yêu cầu hoàn cọc" />;
  }
  return <Queue key={`${api.origin}:${session.user.id}:${session.user.storeId}:${session.user.allStores}`} />;
}
