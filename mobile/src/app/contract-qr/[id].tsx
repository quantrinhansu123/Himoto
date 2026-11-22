import { useEffect, useState } from 'react';
import { AppState, Keyboard, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Copy } from 'lucide-react-native';
import { copyText } from '@/lib/clipboard';
import { useSession } from '@/providers/session';
import { dateTime, money, useTheme } from '@/theme';
import { Button, Card, InfoBanner, InlineError, KeyValueRow, StateView, StatusBadge } from '@/components/ui';
import { ChoiceField, FormField } from '@/components/form-fields';
import { BillPhoto } from '@/components/bill-photo';
export default function ContractQrScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(), { api, session } = useSession();
  if (!api || !session || !/^[1-9]\d{0,14}$/.test(id) || !session.user.permissions.includes('contracts.read')) return <StateView title="Không mở được QR hợp đồng" />;
  return <ContractQr key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}:${id}`} id={id} />;
}
function ContractQr({ id }: { id: string }) {
  const { api, session } = useSession(), theme = useTheme(), [active, setActive] = useState(AppState.currentState === 'active'), [bankId, setBankId] = useState(''), [amount, setAmount] = useState<number | null>(null), [amountText, setAmountText] = useState(''), [error, setError] = useState(''), [copied, setCopied] = useState('');
  useEffect(() => { const listener = AppState.addEventListener('change', s => setActive(s === 'active')); return () => listener.remove(); }, []);
  const query = useQuery({ queryKey: ['contract-qr', api?.origin, session?.user.id, session?.user.storeId, session?.user.allStores, id, bankId, amount], gcTime: 0, retry: false, staleTime: 0, refetchInterval: active ? 4000 : false, refetchIntervalInBackground: false, enabled: !!api && active,
    queryFn: ({ signal }) => api!.contractQr(id, new URLSearchParams({ ...(bankId ? { account_id: bankId } : {}), ...(amount === null ? {} : { amount: String(amount) }) }), signal) });
  const p = query.data, text = { color: theme.text, fontSize: 15, lineHeight: 22 }, muted = { color: theme.muted, fontSize: 13, lineHeight: 20 };
  async function handleCopy(label: string, val: string) {
    if (await copyText(val)) setCopied(`Đã sao chép ${label}`);
  }
  function applyAmount() {
    Keyboard.dismiss(); if (amountText !== '' && !/^(0|[1-9]\d{0,12})$/.test(amountText)) { setError('Nhập số tiền nguyên VND từ 0 đến 9.999.999.999.999.'); return; }
    const next = amountText === '' ? null : Number(amountText);
    const remainingDebt = p && p.total !== null && p.paid !== null ? Math.max(0, p.total - p.paid) : null;
    if (next !== null && next > 0 && remainingDebt !== null && remainingDebt > 0 && next > remainingDebt) {
      setError(`Số tiền tạo QR (${money(next)}) đang vượt công nợ hiện tại (${money(remainingDebt)}). Kiểm tra lại trước khi gửi khách.`);
      return;
    }
    setError(''); if (next === amount) void query.refetch(); else setAmount(next);
  }
  const paidInFull = Boolean(p && p.total !== null && p.paid !== null && p.total > 0 && p.paid >= p.total);
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}><Stack.Screen options={{ title: 'Chuyển khoản theo hợp đồng' }} /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
    {query.isPending && <StateView title="Đang lấy tài khoản nhận và công nợ" loading />}
    {query.isError && <StateView title="Chưa xác nhận được QR hiện tại" message={(query.error as Error).message} retry={() => void query.refetch()} />}
    {!!error && <InlineError message={error} />}
    {!!copied && <InfoBanner tone="success" message={copied} />}
    {p && <>
      {paidInFull && <InfoBanner tone="success" title="Hợp đồng đã thanh toán đủ" message={`Đã thu ${money(p.paid)} / ${money(p.total)}. Chỉ tạo mã QR mới nếu có khoản thu phát sinh thêm.`} />}
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>{p.code}</Text>
          <StatusBadge status={paidInFull ? 'completed' : 'active'} label={paidInFull ? 'Đã thu đủ' : 'Đang chờ thu'} />
        </View>
        <KeyValueRow label="Giá trị hợp đồng" value={money(p.total)} />
        <KeyValueRow label="Đã thu tiền thuê" value={money(p.paid)} />
        <KeyValueRow label="Số tiền trên mã QR" value={money(p.amount)} emphasize valueColor={theme.primary} />
        <Text style={muted}>Cập nhật: {dateTime(new Date(query.dataUpdatedAt).toISOString())}. Tự kiểm tra khoản thu khi màn hình đang mở.</Text>
        {p.mode === 'test' && <InfoBanner tone="warning" message={`SePay đang ở chế độ thử. Đã nhận mô phỏng: ${money(p.receivedDemo)}.`} />}
      </Card>
      <ChoiceField label="Tài khoản nhận của cơ sở hợp đồng" value={bankId || String(p.bankId || '')} choices={[{ value: '', label: 'Chọn tài khoản / dùng mặc định của cơ sở' }, ...p.accounts.map(a => ({ value: String(a.id), label: `${a.bankCode} · ${a.accountNumber} · ${a.accountName}${a.ownerType === 'company' ? ' (công ty)' : ''}` }))]} searchable onChange={v => { setBankId(v); setError(''); }} />
      <FormField label="Số tiền cần tạo QR (VND)" value={amountText} keyboardType="number-pad" maxLength={13} onChangeText={setAmountText} hint="Để trống lấy công nợ hiện tại. Nhập 0 để không cố định số tiền trên mã." />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button size="sm" equalWidth label="Tạo / cập nhật QR" loading={query.isPending} onPress={applyAmount} />
        <Button size="sm" equalWidth secondary label="Lấy mặc định" disabled={query.isPending} onPress={() => { setBankId(''); setAmount(null); setAmountText(''); setError(''); void query.refetch(); }} />
      </View>
      {!query.isError && p.configured && p.bank && p.qrUrl ? <Card style={{ gap: 10 }}>
        <BillPhoto key={p.qrUrl} source={{ uri: p.qrUrl }} label={`QR chuyển khoản hợp đồng ${p.code}`} context="thanh toán" />
        <KeyValueRow label="Ngân hàng & STK" value={`${p.bank.bankCode} · ${p.bank.accountNumber}`} selectable emphasize />
        <KeyValueRow label="Chủ tài khoản" value={p.bank.accountName} selectable />
        <KeyValueRow label="Nội dung CK" value={p.memo} selectable emphasize />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button size="sm" equalWidth secondary icon={<Copy size={13} color={theme.text} />} label="Chép STK" onPress={() => void handleCopy('số tài khoản', p.bank!.accountNumber)} />
          <Button size="sm" equalWidth secondary icon={<Copy size={13} color={theme.text} />} label="Chép nội dung" onPress={() => void handleCopy('nội dung chuyển khoản', p.memo)} />
          {p.amount > 0 && <Button size="sm" equalWidth secondary icon={<Copy size={13} color={theme.text} />} label="Chép số tiền" onPress={() => void handleCopy('số tiền', String(p.amount))} />}
        </View>
        {p.amount === 0 && <Text style={muted}>Mã không cố định số tiền; đối chiếu thỏa thuận trước khi chuyển.</Text>}
        <Text style={muted}>Kiểm tra ngân hàng, số tài khoản, chủ tài khoản, tiền và nội dung trong ứng dụng ngân hàng. Công nợ chỉ cập nhật sau khi hệ thống nhận giao dịch thực tế.</Text>
      </Card> : !query.isError && <Card><Text style={text}>{p.configurationMessage || 'Chưa có tài khoản hợp lệ để tạo QR. Chọn tài khoản nhận hoặc kiểm tra cấu hình cơ sở.'}</Text></Card>}
    </>}
  </ScrollView></SafeAreaView>;
}
