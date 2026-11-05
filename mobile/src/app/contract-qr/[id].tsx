import { useEffect, useState } from 'react';
import { AppState, Keyboard, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/providers/session';
import { dateTime, money, useTheme } from '@/theme';
import { Button, Card, InlineError, StateView } from '@/components/ui';
import { ChoiceField, FormField } from '@/components/form-fields';
import { BillPhoto } from '@/components/bill-photo';
export default function ContractQrScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(), { api, session } = useSession();
  if (!api || !session || !/^[1-9]\d{0,14}$/.test(id) || !session.user.permissions.includes('contracts.read')) return <StateView title="Không mở được QR hợp đồng" />;
  return <ContractQr key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}:${id}`} id={id} />;
}
function ContractQr({ id }: { id: string }) {
  const { api, session } = useSession(), theme = useTheme(), [active, setActive] = useState(AppState.currentState === 'active'), [bankId, setBankId] = useState(''), [amount, setAmount] = useState<number | null>(null), [amountText, setAmountText] = useState(''), [error, setError] = useState('');
  useEffect(() => { const listener = AppState.addEventListener('change', s => setActive(s === 'active')); return () => listener.remove(); }, []);
  const query = useQuery({ queryKey: ['contract-qr', api?.origin, session?.user.id, session?.user.storeId, session?.user.allStores, id, bankId, amount], gcTime: 0, retry: false, staleTime: 0, refetchInterval: active ? 4000 : false, refetchIntervalInBackground: false, enabled: !!api && active,
    queryFn: ({ signal }) => api!.contractQr(id, new URLSearchParams({ ...(bankId ? { account_id: bankId } : {}), ...(amount === null ? {} : { amount: String(amount) }) }), signal) });
  const p = query.data, text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  function applyAmount() {
    Keyboard.dismiss(); if (amountText !== '' && !/^(0|[1-9]\d{0,12})$/.test(amountText)) { setError('Nhập số tiền nguyên VND từ 0 đến 9.999.999.999.999.'); return; }
    setError(''); const next = amountText === '' ? null : Number(amountText); if (next === amount) void query.refetch(); else setAmount(next);
  }
  return <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: theme.background }}><Stack.Screen options={{ title: 'Chuyển khoản theo hợp đồng' }} /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16 }}>
    {query.isPending && <StateView title="Đang lấy tài khoản nhận và công nợ" loading />}
    {query.isError && <StateView title="Chưa xác nhận được QR hiện tại" message={(query.error as Error).message} retry={() => void query.refetch()} />}
    {!!error && <InlineError message={error} />}
    {p && <>
      <Card style={{ gap: 10 }}><Text accessibilityRole="header" style={{ ...text, fontSize: 22, fontWeight: '700' }}>{p.code}</Text><Text style={text}>Giá trị hợp đồng: {money(p.total)} · Đã thu tiền thuê: {money(p.paid)}</Text><Text style={text}>Số tiền QR: {money(p.amount)}</Text><Text style={muted}>Cập nhật: {dateTime(new Date(query.dataUpdatedAt).toISOString())}. Tự kiểm tra khoản thu khi màn hình đang mở.</Text>
        {p.mode === 'test' && <Text style={text}>SePay đang ở chế độ thử. QR vẫn trỏ đến tài khoản ngân hàng đã cấu hình; giao dịch mô phỏng không thay công nợ thật. Đã nhận mô phỏng: {money(p.receivedDemo)}.</Text>}
      </Card>
      <ChoiceField label="Tài khoản nhận của cơ sở hợp đồng" value={bankId || String(p.bankId || '')} choices={[{ value: '', label: 'Chọn tài khoản / dùng mặc định của cơ sở' }, ...p.accounts.map(a => ({ value: String(a.id), label: `${a.bankCode} · ${a.accountNumber} · ${a.accountName}${a.ownerType === 'company' ? ' (công ty)' : ''}` }))]} searchable onChange={v => { setBankId(v); setError(''); }} />
      <FormField label="Số tiền cần tạo QR (VND)" value={amountText} keyboardType="number-pad" maxLength={13} onChangeText={setAmountText} hint="Để trống lấy công nợ hiện tại. Nhập 0 để không cố định số tiền trên mã." />
      <Button label="Tạo / cập nhật mã QR" loading={query.isFetching} onPress={applyAmount} />
      <Button secondary label="Lấy lại tiền và tài khoản mặc định" disabled={query.isFetching} onPress={() => { setBankId(''); setAmount(null); setAmountText(''); setError(''); void query.refetch(); }} />
      {!query.isError && p.configured && p.bank && p.qrUrl ? <Card style={{ gap: 12 }}>
        <BillPhoto key={p.qrUrl} source={{ uri: p.qrUrl }} label={`QR chuyển khoản hợp đồng ${p.code}`} context="thanh toán" />
        <Text selectable style={text}>{p.bank.bankCode} · {p.bank.accountNumber}</Text><Text selectable style={text}>{p.bank.accountName}</Text><Text selectable style={text}>Nội dung: {p.memo}</Text>
        {p.amount === 0 && <Text style={muted}>Mã không cố định số tiền; đối chiếu thỏa thuận trước khi chuyển.</Text>}
        <Text style={muted}>Kiểm tra ngân hàng, số tài khoản, chủ tài khoản, tiền và nội dung trong ứng dụng ngân hàng. Công nợ chỉ cập nhật sau khi hệ thống nhận giao dịch thực tế.</Text>
      </Card> : !query.isError && <Card><Text style={text}>{p.configurationMessage || 'Chưa có tài khoản hợp lệ để tạo QR. Chọn tài khoản nhận hoặc kiểm tra cấu hình cơ sở.'}</Text></Card>}
    </>}
  </ScrollView></SafeAreaView>;
}
