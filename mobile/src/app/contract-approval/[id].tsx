import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { uuid } from 'expo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/providers/session';
import { dateTime, money, useTheme } from '@/theme';
import { Button, Card, InlineError, StateView, StatusBadge } from '@/components/ui';
import { ConfirmEdit } from '@/components/editor-sheet';
import { contextualStatusLabel } from '@/lib/catalogue-config';
import { pendingWrites } from '@/lib/pending-writes';
import type { MobileContractApprovalResult } from '../../../../shared/mobile-contract-approval';

export default function ContractApprovalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(), { api, session } = useSession();
  if (!api || !session || !/^[1-9]\d{0,14}$/.test(id) || !session.user.permissions.includes('contracts.read')) return <StateView title="Không mở được màn duyệt hợp đồng" />;
  return <ApprovalForm key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${id}`} id={id} />;
}
function ApprovalForm({ id }: { id: string }) {
  const { api, session } = useSession(), theme = useTheme(), cache = useQueryClient(), operation = `contract.approve:${id}`;
  const scope = useMemo(() => api && session ? { origin: api.origin, userId: session.user.id, storeId: session.user.allStores ? null : session.user.storeId, allStores: session.user.allStores } : null, [api, session]);
  const epoch = useRef({ generation: 0 }), running = useRef(false);
  useEffect(() => { const guard = epoch.current; guard.generation++; return () => { guard.generation++; }; }, [api, session]);
  const active = (version: number) => epoch.current.generation === version;
  const [pending, setPending] = useState<string | null>(null), [receipt, setReceipt] = useState<MobileContractApprovalResult | null>(null);
  const [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const query = useQuery({ queryKey: ['contract-approval', api?.origin, session?.user.id, session?.user.storeId, session?.user.allStores, id], retry: false, staleTime: 0,
    enabled: !!api && !!scope, queryFn: async ({ signal }) => {
      const key = await pendingWrites.lookup(scope!, operation);
      if (signal.aborted) throw Error('Đã dừng tải.');
      if (key) { const found = await api!.contractApprovalResult(key, signal);
        if (found.result && found.result.operation !== operation) throw Error('Kết quả duyệt không khớp hồ sơ. Giữ mã để đối chiếu.');
        return { key, result: found.result, context: null }; }
      return { key: null, result: null, context: await api!.contractApproval(id, signal) };
    } });
  const key = pending || query.data?.key || null, proof = receipt || query.data?.result || null;
  const state = proof?.approval || query.data?.context?.approval || null;
  function invalidate() { for (const queryKey of [['record'], ['catalogue'], ['overview'], ['contract-approval-context']]) void cache.invalidateQueries({ queryKey }); }
  async function save() {
    if (!api || !scope || !state?.can_approve || query.isError || key || running.current) return;
    const version = epoch.current.generation; running.current = true; setBusy(true); setConfirm(false); setError('');
    try {
      const reserved = await pendingWrites.reserveExclusive(scope, operation, [operation], () => uuid.v4().toLowerCase());
      if (!active(version)) return; setPending(reserved.key);
      if (!reserved.created) { const found = await api.contractApprovalResult(reserved.key); if (active(version)) setReceipt(found.result); return; }
      const found = await api.approveContract(id, state.revision, reserved.key);
      if (active(version)) { setReceipt(found); invalidate(); }
    } catch (cause) { if (active(version)) setError((cause as Error).message); }
    finally { running.current = false; if (active(version)) setBusy(false); }
  }
  async function resolve() {
    if (!api || !scope || !key || running.current) return;
    const version = epoch.current.generation; running.current = true; setBusy(true); setError('');
    try {
      const result = await api.resolveWrite(key, operation); if (!active(version)) return;
      if (result.status === 'committed') {
        const found = await api.contractApprovalResult(key); if (!active(version)) return;
        if (!found.result || found.result.operation !== operation) throw Error('Chưa tải được kết quả duyệt. Giữ mã để đối chiếu.');
        setReceipt(found.result); invalidate();
      } else {
        await pendingWrites.complete(scope, operation, key); if (!active(version)) return;
        setPending(null); setNotice('Lần duyệt trước chưa được ghi và mã cũ đã khóa. Kiểm tra lại hợp đồng trước khi duyệt.'); await query.refetch();
      }
    } catch (cause) { if (active(version)) setError((cause as Error).message); }
    finally { running.current = false; if (active(version)) setBusy(false); }
  }
  async function acknowledge() {
    if (!scope || !key || !proof || running.current) return;
    const version = epoch.current.generation; running.current = true; setBusy(true); setError('');
    try { await pendingWrites.complete(scope, operation, key); if (active(version)) { invalidate(); router.dismissTo({ pathname: '/record/[kind]/[id]', params: { kind: 'contracts', id } }); } }
    catch (cause) { if (active(version)) setError((cause as Error).message); }
    finally { running.current = false; if (active(version)) setBusy(false); }
  }
  const text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
    <Stack.Screen options={{ title: 'Duyệt thuê sở hữu' }} />
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center', paddingBottom: 36 }}>
      <Text accessibilityRole="header" style={{ ...text, fontSize: 26, lineHeight: 34, fontWeight: '800' }}>Kiểm tra hợp đồng</Text>
      {!!(error || query.error) && <InlineError message={error || query.error?.message || 'Chưa tải được hợp đồng.'} />}
      {!!notice && <Text accessibilityLiveRegion="polite" style={text}>{notice}</Text>}
      {query.isPending && <StateView title="Đang kiểm tra hợp đồng và lần duyệt trước" loading />}
      {query.isError && <Button secondary label="Tải lại thông tin duyệt" disabled={busy} onPress={() => void query.refetch()} />}
      {key && <Card style={{ gap: 12 }}>
        <Text accessibilityRole="header" style={{ ...text, fontSize: 20, fontWeight: '700' }}>{proof ? 'Yêu cầu duyệt đã được ghi nhận' : 'Cần đối chiếu lần duyệt trước'}</Text>
        <Text selectable style={muted}>Mã lần duyệt: {key}</Text>
        {proof ? <><Text style={muted}>Trạng thái bên dưới là thông tin hợp đồng hiện tại. Nếu hợp đồng được sửa sau lần duyệt, cần kiểm tra lại trước khi tiếp tục.</Text><Button label="Đã kiểm tra kết quả duyệt" loading={busy} onPress={() => void acknowledge()} /></> : <><Text style={text}>Đối chiếu sẽ mở kết quả nếu đã ghi. Nếu chưa ghi, mã cũ được khóa trước khi cho duyệt lại.</Text><Button label="Đối chiếu lần duyệt trước" loading={busy} onPress={() => void resolve()} /></>}
      </Card>}
      {state && <Card style={{ gap: 14 }}>
        <Text selectable style={{ ...text, fontSize: 22, fontWeight: '700' }}>{state.code}</Text>
        <StatusBadge status={state.status} label={contextualStatusLabel('contracts', state.status)} />
        <Text style={text}>Khách hàng: {state.customer_name || 'Chưa nhập'}</Text>
        <Text style={text}>Cơ sở: {state.store_name || 'Chưa xác định'}</Text>
        <Text style={text}>Giá trị hợp đồng: {money(state.total_amount)}</Text>
        <Text style={text}>Tiền cọc theo hợp đồng: {money(state.deposit_amount)}</Text>
        <Text accessibilityLiveRegion="polite" style={text}>{state.approved_at ? `Đã duyệt bởi ${state.approved_by || 'Chưa rõ người duyệt'}\n${dateTime(state.approved_at)}` : 'Chưa được duyệt'}</Text>
        {!key && <Text style={muted}>{state.can_approve ? 'Kiểm tra đầy đủ hồ sơ, xe, số tiền và điều kiện trước khi xác nhận duyệt.' : state.approved_at ? 'Hợp đồng đã được duyệt.' : state.status === 'draft' ? 'Cần kiểm tra và phát hành bản nháp trước khi duyệt hợp đồng.' : state.status === 'cancelled' ? 'Hợp đồng đã hủy không thể duyệt.' : 'Chỉ quản lý hoặc quản trị viên có quyền duyệt mới được xác nhận.'}</Text>}
        {!key && state.can_approve && <Button label="Duyệt hợp đồng sở hữu" disabled={busy || query.isFetching || query.isError} onPress={() => setConfirm(true)} />}
      </Card>}
      {query.isSuccess && (!key || proof) && !state && <Card><Text style={text}>Hợp đồng này hiện không thuộc nhóm thuê sở hữu hoặc cơ sở áp dụng duyệt thuê sở hữu.</Text></Card>}
      {!key && <Button secondary label="Tải lại hợp đồng trước khi duyệt" disabled={busy || query.isFetching} onPress={() => void query.refetch()} />}
      <Button secondary label="Mở hồ sơ hợp đồng" disabled={busy} onPress={() => router.push({ pathname: '/record/[kind]/[id]', params: { kind: 'contracts', id } })} />
    </ScrollView>
    {confirm && state && <ConfirmEdit title="Xác nhận duyệt hợp đồng" message={`${state.code}\n${state.customer_name}\n${state.store_name}\nGiá trị: ${money(state.total_amount)}\nTiền cọc: ${money(state.deposit_amount)}\n\nXác nhận đã kiểm tra hồ sơ và đủ điều kiện duyệt.`} confirmLabel="Xác nhận duyệt sở hữu" busy={busy} onCancel={() => setConfirm(false)} onConfirm={() => void save()} />}
  </SafeAreaView>;
}
