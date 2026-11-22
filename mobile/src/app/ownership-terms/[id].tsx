import { useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { ownershipTermChoices, type MobileOwnershipTermsInput, type MobileOwnershipTerm } from '../../../../shared/mobile-ownership-terms';
import { useSession } from '@/providers/session';
import { useOwnershipTermsWrite } from '@/hooks/use-ownership-terms-write';
import { dateTime, money, useTheme } from '@/theme';
import { Button, Card, InlineError, KeyValueRow, StateView } from '@/components/ui';
import { ChoiceField, FormField } from '@/components/form-fields';
import { ConfirmEdit } from '@/components/editor-sheet';

export default function OwnershipTermsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(), { api, session } = useSession();
  if (!api || !session || !/^[1-9]\d{0,14}$/.test(id) || !session.user.permissions.includes('contracts.read')) return <StateView title="Không mở được thời hạn thuê sở hữu" />;
  return <OwnershipTermsEditor key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${id}`} id={id} />;
}
function OwnershipTermsEditor({ id }: { id: string }) {
  const write = useOwnershipTermsWrite(id), theme = useTheme(), [input, setInput] = useState<MobileOwnershipTermsInput | null>(null), [error, setError] = useState(''), [review, setReview] = useState(false), [reload, setReload] = useState(false), [exit, setExit] = useState<(() => void) | null>(null);
  const p = write.query.data?.profile, original: MobileOwnershipTermsInput | null = p ? { revision: p.revision, term_months: p.term_months, daily_amount: p.daily_amount === null ? null : String(p.daily_amount) } : null, value = input || original;
  const dirty = !!input && JSON.stringify(input) !== JSON.stringify(original), disabled = write.busy || !!write.key || !p?.can_edit;
  const disablePrevention = usePreventRemove(write.busy || dirty && !write.proof, ({ repeat }) => setExit(() => repeat));
  const text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  function change(next: MobileOwnershipTermsInput) { if (!disabled) { setInput(next); setError(''); } }
  function check() {
    Keyboard.dismiss(); if (!value) return;
    if (value.daily_amount !== null && !/^[1-9]\d{0,12}$/.test(value.daily_amount)) { setError('Mức đóng phải là số nguyên VND lớn hơn 0; để trống nếu chưa xác định.'); return; }
    setError(''); setReview(true);
  }
  const term = (v: string) => ownershipTermChoices.find(t => t.value === v)?.label || v;
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}><Stack.Screen options={{ title: 'Thời hạn / mức đóng sở hữu' }} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
      {!!write.error && <InlineError message={write.error} />}{!!error && <InlineError message={error} />}{!!write.notice && <Text style={muted}>{write.notice}</Text>}
      {write.query.isPending && <StateView title="Đang tải thời hạn thuê sở hữu" loading />}{write.query.isError && <StateView title="Chưa tải được thời hạn thuê sở hữu" message={(write.query.error as Error).message} retry={() => void write.query.refetch()} />}
      {write.key && <Card style={{ gap: 12 }}><Text selectable style={muted}>Mã lần sửa: {write.key}</Text>{write.proof ? <><Text style={text}>Đã lưu thời hạn / mức đóng · Hồ sơ #{write.proof.receipt.id}</Text><Text style={muted}>Phiên bản lần lưu: {write.proof.receipt.revision}. Thông tin hiện tại có thể đã được sửa tiếp.</Text><Button label="Đã xem kết quả, mở hồ sơ" loading={write.busy} onPress={() => void write.acknowledge(disablePrevention)} /></> : <Button label="Đối chiếu kết quả thời hạn sở hữu" loading={write.busy} onPress={() => void write.resolve()} />}</Card>}
      {p && value && !write.key && <>
        <Card style={{ gap: 10 }}>
          <Text accessibilityRole="header" style={{ ...text, fontSize: 20, fontWeight: '800' }}>{p.code}</Text>
          <View style={{ gap: 2 }}>
            <KeyValueRow label="Thời hạn hiện tại" value={term(p.term_months)} emphasize />
            <KeyValueRow label="Mức đóng/ngày" value={money(p.daily_amount)} emphasize />
          </View>
          <Text style={muted}>Mức đóng theo ngày là tổng của hợp đồng. Cập nhật này giữ tổng tiền hợp đồng, phiếu, tiền đã thu và lịch đóng đã lập. Hợp đồng có một xe đang thuê sẽ đồng bộ mức đóng trên dòng xe.</Text>
          {!p.can_edit && <Text style={text}>Hồ sơ hoặc vai trò hiện tại chỉ cho xem thời hạn và mức đóng.</Text>}
        </Card>
        <ChoiceField label="Thời hạn thuê sở hữu" value={value.term_months} choices={ownershipTermChoices.map(t => ({ ...t }))} disabled={disabled} onChange={v => change({ ...value, term_months: v as MobileOwnershipTerm })} />
        <FormField label="Tổng mức đóng mỗi ngày (VND)" value={value.daily_amount || ''} keyboardType="number-pad" maxLength={13} editable={!disabled} onChangeText={v => change({ ...value, daily_amount: v || null })} hint="Để trống nếu chưa xác định. Nhập tổng mức đóng của tất cả xe trong hợp đồng." />
        {p.can_edit && <Button label="Kiểm tra thời hạn / mức đóng" disabled={disabled} onPress={check} />}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button size="sm" equalWidth secondary label="Tải lại thời hạn sở hữu mới nhất" disabled={write.busy || write.query.isFetching} onPress={() => setReload(true)} />
          <Button size="sm" equalWidth secondary label="Xem lịch sử thay đổi đầy đủ" onPress={() => router.push({ pathname: '/contract-history/[id]', params: { id } })} />
        </View>
        {!!p.history?.length && (
          <Card style={{ gap: 10 }}>
            <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>
              Lịch sử sửa thời hạn & mức đóng ({p.history.length})
            </Text>
            {p.history.map((item, idx) => (
              <View key={`${item.at}:${idx}`} style={{ gap: 2, paddingTop: idx > 0 ? 8 : 0, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: theme.border }}>
                <KeyValueRow label="Thời điểm & người sửa" value={`${dateTime(item.at)} · ${item.actor}`} />
                <KeyValueRow label="Thời hạn" value={`${term(item.before.term_months)} → ${term(item.after.term_months)}`} emphasize />
                <KeyValueRow label="Mức đóng/ngày" value={`${item.before.daily_amount == null ? 'Chưa xác định' : money(item.before.daily_amount)} → ${item.after.daily_amount == null ? 'Chưa xác định' : money(item.after.daily_amount)}`} />
              </View>
            ))}
          </Card>
        )}
      </>}
    </ScrollView></KeyboardAvoidingView>
    {review && p && value && <ConfirmEdit title="Lưu thời hạn / mức đóng sở hữu?" message={`${p.code}\nThời hạn: ${term(p.term_months)} → ${term(value.term_months)}\nTổng mức đóng/ngày: ${money(p.daily_amount)} → ${value.daily_amount === null ? 'Chưa xác định' : money(Number(value.daily_amount))}\n\nGiữ nguyên tiền/phiếu và lịch đóng đã lập; lưu người sửa và dữ liệu trước–sau.`} confirmLabel="Xác nhận lưu thời hạn sở hữu" busy={write.busy} onCancel={() => setReview(false)} onConfirm={() => { setReview(false); void write.save(value); }} />}
    {reload && <ConfirmEdit title="Tải lại thời hạn sở hữu?" message="Nội dung chưa gửi sẽ thay bằng hồ sơ mới nhất." confirmLabel="Tải lại thời hạn sở hữu" onCancel={() => setReload(false)} onConfirm={() => { setReload(false); void write.query.refetch().then(r => { if (r.data?.profile) setInput(null); }); }} />}
    {exit && <ConfirmEdit title="Rời màn thời hạn sở hữu?" message="Nội dung chưa gửi sẽ mất. Mã lần sửa đã gửi được giữ trong Tài khoản để đối chiếu." confirmLabel="Rời màn thời hạn sở hữu" busy={write.busy} onCancel={() => setExit(null)} onConfirm={() => { if (!write.busy) exit(); }} />}
  </SafeAreaView>;
}
