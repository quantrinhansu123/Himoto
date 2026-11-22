import { useState } from 'react';
import { Text } from 'react-native';
import { depositRefundStatus, type DepositRefundRequest } from '../../../shared/deposit-refunds';
import { PAYMENT_METHODS } from '../../../shared/payment-methods';
import { useSession } from '@/providers/session';
import { dateTime, money, useTheme } from '@/theme';
import { BillPhoto } from './bill-photo';
import { Button, Card } from './ui';

export function DepositRefundRequestCard({ row, showPhoto = false }: { row: DepositRefundRequest; showPhoto?: boolean }) {
  const { api } = useSession();
  const theme = useTheme();
  const [photo, setPhoto] = useState(showPhoto);
  const method = PAYMENT_METHODS.find(item => item.value === row.method)?.label ?? row.method;
  return <Card style={{ gap: 10 }}>
    <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>
      {depositRefundStatus[row.status]} · {money(row.amount)}
    </Text>
    <Text style={{ color: theme.muted }}>{row.store} · {row.actor}</Text>
    <Text style={{ color: theme.text }}>{method} · {row.account_label} · {dateTime(`${row.paid_at}:00+07:00`)}</Text>
    {!!row.replaces_id && <Text style={{ color: theme.text }}>Phiếu chi cần sửa #{row.replaces_id}</Text>}
    {!!row.transaction_id && <Text style={{ color: theme.text }}>Phiếu chi đã ghi #{row.transaction_id}</Text>}
    {!!row.reason && <Text style={{ color: theme.text, lineHeight: 22 }}>{row.reason}</Text>}
    {!!row.review_reason && <Text style={{ color: theme.muted, lineHeight: 22 }}>{row.review_reason}</Text>}
    {!!row.reviewer && <Text style={{ color: theme.muted, lineHeight: 22 }}>{row.reviewer}{row.review_note ? ` · ${row.review_note}` : ''}</Text>}
    <Button secondary label={photo ? 'Ẩn ảnh chứng từ' : 'Xem ảnh chứng từ'} onPress={() => setPhoto(value => !value)} />
    {photo && <BillPhoto label={`Chứng từ hoàn cọc HĐ ${row.code}`} context="chứng từ hoàn cọc" source={api!.depositRefundEvidence(row.id)} />}
  </Card>;
}
