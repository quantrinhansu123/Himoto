import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { uuid } from "expo";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "@/providers/session";
import { pendingWrites } from "@/lib/pending-writes";
import { useTheme, money } from "@/theme";
import { Button, Card, InlineError, KeyValueRow, StateView, StatusBadge } from "@/components/ui";
import { ConfirmEdit } from "@/components/editor-sheet";

import { BatterySummary } from "@/components/battery-summary";
function Profile({ id }: { id: string }) {
  const { api, session } = useSession(), theme = useTheme(), [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState(''), alive = useRef(true), running = useRef(false); useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const query = useQuery({ queryKey: ['battery', session!.user.id, id], queryFn: ({ signal }) => api!.battery(id, signal), enabled: session!.user.permissions.includes('contracts.read'), retry: false }); if (!session!.user.permissions.includes('contracts.read')) return <StateView title="Không có quyền xem hợp đồng pin" />; if (query.isPending) return <StateView title="Đang mở hồ sơ pin / sạc" loading />; if (query.isError) return <StateView title="Chưa mở được hồ sơ pin" message={query.error.message} retry={() => { void query.refetch(); }} />; const context = query.data, r = context.contract;
  async function remove() { if (!api || !session || running.current) return; running.current = true; setBusy(true); setConfirm(false); setError(''); try { const scope = { origin: api.origin, userId: session.user.id, storeId: session.user.allStores ? null : session.user.storeId, allStores: session.user.allStores }, operation = `battery.delete:${id}`, intent = await pendingWrites.reserveExclusive(scope, operation, ['update', 'delete', 'renew', 'collect_renewal', 'return'].map(a => `battery.${a}:${id}`), () => uuid.v4().toLowerCase()); if (!alive.current) return; setPending(true); if (!intent.created) throw Error('Còn thao tác pin chưa đối chiếu. Mở Tài khoản để kiểm tra mã gốc.'); await api.deleteBattery(id, r.revision, intent.key); if (!alive.current) return; router.replace({ pathname: '/battery-result/[key]', params: { key: intent.key } }); } catch (cause) { if (alive.current) setError((cause as Error).message); } finally { running.current = false; if (alive.current) setBusy(false); } }
  const historyNewestFirst = [...context.history].reverse();
  const methodLabel = (m?: string) => m === 'cash' ? 'Tiền mặt' : m === 'company_transfer' ? 'CK công ty' : m === 'transfer' ? 'Chuyển khoản' : '';
  const accountLabel = (e: typeof context.history[number]) => {
    if (!e.receipt) return '';
    const found = context.accounts.find(a => a.id === e.receipt!.account_id && (e.receipt!.method === 'cash' ? a.kind === 'cash' : a.kind === 'bank'));
    return [methodLabel(e.receipt.method), found?.label].filter(Boolean).join(' · ');
  };
  const canRenew = session!.user.permissions.includes('contracts.renew');
  const canReturn = session!.user.permissions.includes('contracts.return');
  const canDraft = session!.user.permissions.includes('contracts.draft');
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background }}><ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12, maxWidth: 760, width: '100%', alignSelf: 'center' }} refreshControl={<RefreshControl refreshing={query.isRefetching} tintColor={theme.primary} onRefresh={() => { void query.refetch(); }} />}>
    <BatterySummary record={r} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Button size="sm" equalWidth secondary label="Xem giấy / in" disabled={pending || busy} onPress={() => router.push({ pathname: '/print/[kind]/[id]', params: { kind: 'battery-contracts', id } })} />
      {canDraft && <Button size="sm" equalWidth secondary label="Sửa HĐ pin / sạc" disabled={pending || busy} onPress={() => router.push({ pathname: '/battery-editor/[id]', params: { id } })} />}
    </View>
    {r.vehicle_contract_id && <Button size="sm" secondary label={`Mở hợp đồng xe · ${r.vehicle_contract_code || r.vehicle_contract_id}`} onPress={() => router.push({ pathname: '/record/[kind]/[id]', params: { kind: 'contracts', id: String(r.vehicle_contract_id) } })} />}
    {(r.status === 'renting' && (canRenew || canReturn) || (context.renewal_remaining > 0 && r.status !== 'cancelled' && canRenew)) && (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {r.status === 'renting' && canRenew && <Button size="sm" equalWidth label="Gia hạn pin / sạc" disabled={pending || busy} onPress={() => router.push({ pathname: '/battery-action/[id]', params: { id, mode: 'renew' } })} />}
        {context.renewal_remaining > 0 && canRenew && <Button size="sm" equalWidth label="Thu nợ gia hạn" disabled={pending || busy} onPress={() => router.push({ pathname: '/battery-action/[id]', params: { id, mode: 'collect_renewal' } })} />}
        {r.status === 'renting' && canReturn && <Button size="sm" equalWidth secondary label="Trả pin / sạc" disabled={pending || busy} onPress={() => router.push({ pathname: '/battery-action/[id]', params: { id, mode: 'return' } })} />}
      </View>
    )}
    <Card style={{ gap: 6, padding: 14 }}>
      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>Lịch sử và công nợ gia hạn</Text>
      <KeyValueRow label="Tổng phí gia hạn" value={money(context.renewal_amount)} />
      <KeyValueRow label="Đã thu gia hạn" value={money(context.renewal_collected)} valueColor={theme.success} />
      <KeyValueRow label="Còn phải thu" value={money(context.renewal_remaining)} emphasize valueColor={context.renewal_remaining > 0 ? theme.warning : theme.success} />
    </Card>
    {historyNewestFirst.map(e => {
      const payText = accountLabel(e);
      const canEventTelegram = r.status !== 'cancelled' && (e.action === 'return' ? canReturn : canRenew);
      return <Card key={e.request_id} style={{ gap: 6, padding: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: theme.text, fontSize: 15.5, fontWeight: '800', flex: 1 }}>{e.action === 'renew' ? 'Gia hạn' : e.action === 'return' ? 'Trả pin / sạc' : 'Thu nợ gia hạn'}</Text>
          <StatusBadge status={e.action === 'return' ? 'completed' : (e.remaining ?? 0) > 0 ? 'warning' : 'active'} label={e.action === 'return' ? 'Đã trả' : (e.remaining ?? 0) > 0 ? 'Còn nợ' : 'Đã thu'} />
        </View>
        <KeyValueRow label="Thời điểm / Người lập" value={`${new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(e.at))} · ${e.actor_name}`} />
        {e.ends_at && <KeyValueRow label="Thời hạn" value={e.before_ends_at ? `${e.before_ends_at.replace('T', ' ')} → ${e.ends_at.replace('T', ' ')}` : e.ends_at.replace('T', ' ')} />}
        {e.returned_at && <KeyValueRow label="Nhận lại" value={e.returned_at.replace('T', ' ')} />}
        {e.amount !== undefined && <KeyValueRow label="Số tiền / Đã thu" value={`${money(e.amount)} / ${money(e.collected || 0)}${e.remaining !== undefined ? ` (Còn ${money(e.remaining)})` : ''}`} emphasize />}
        {!!payText && <KeyValueRow label="Thanh toán" value={payText} />}
        {e.transaction_id && <KeyValueRow label="Phiếu thu" value={`#${e.transaction_id}`} />}
        {!!e.note && <KeyValueRow label="Ghi chú" value={e.note} selectable />}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 2 }}>
          {e.action === 'renew' && (e.remaining ?? 0) > 0 && r.status !== 'cancelled' && canRenew && (
            <Button size="sm" equalWidth label={`Thu tiền (${money(e.remaining || 0)})`} disabled={pending || busy} onPress={() => router.push({ pathname: '/battery-action/[id]', params: { id, mode: 'collect_renewal', renewalId: e.request_id } })} />
          )}
          {canEventTelegram && (
            <Button size="sm" equalWidth secondary label={e.action === 'renew' ? 'Ảnh / Telegram gia hạn' : e.action === 'collect_renewal' ? 'Ảnh / Telegram thu nợ' : 'Ảnh / Telegram trả pin'} onPress={() => router.push({ pathname: '/battery-media/[id]/[eventKey]', params: { id, eventKey: e.request_id } })} />
          )}
        </View>
      </Card>;
    })}
    {r.status !== 'cancelled' && canDraft && <Button size="sm" secondary label="Ảnh / Telegram thuê pin và sạc" onPress={() => router.push({ pathname: "/battery-media/[id]/[eventKey]", params: { id, eventKey: "rental" } })} />}
    {!!error && <InlineError message={error} />}{pending && !busy && <Button size="sm" secondary label="Đối chiếu xóa pin trong Tài khoản" onPress={() => router.push('/(tabs)/account')} />}
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Button size="sm" equalWidth secondary label="Tải lại hồ sơ" loading={query.isFetching} onPress={() => { void query.refetch(); }} />
      {canDraft && <Button size="sm" equalWidth secondary danger label="Xóa HĐ pin / sạc" loading={busy} disabled={pending} onPress={() => setConfirm(true)} />}
    </View>
    {confirm && <ConfirmEdit title={`Xóa ${r.code}?`} message="Hợp đồng sẽ rời danh sách đang quản lý. Các phiếu thu đã ghi được giữ để đối chiếu sổ quỹ." confirmLabel="Xác nhận xóa hợp đồng pin" onCancel={() => setConfirm(false)} onConfirm={() => { void remove(); }} />}
  </ScrollView></SafeAreaView>;
}
export default function Route() { const { id } = useLocalSearchParams<{ id: string }>(), { api, session } = useSession(); if (!api || !session || !/^[1-9]\d{0,14}$/.test(id)) return <StateView title="Không mở được hồ sơ pin" />; return <Profile key={`${id}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}`} id={id} />; }
