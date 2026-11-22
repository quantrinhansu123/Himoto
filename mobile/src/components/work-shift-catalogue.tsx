import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { ATTENDANCE_SHIFTS, shiftCreditLabel } from '../../../shared/attendance-shifts';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';
import { Button, Card, KeyValueRow } from './ui';
import { FilteredListExport } from './filtered-list-export';

export function WorkShiftCatalogue({ store }: { store?: string }) {
  const [open, setOpen] = useState(false), { session } = useSession(), theme = useTheme();
  return <View style={{ gap: 10 }}>
    <Button size="sm" secondary label={open ? 'Ẩn danh mục ca làm việc' : 'Xem danh mục 7 ca làm việc'} onPress={() => setOpen(value => !value)} />
    {open && <Card style={{ gap: 8, padding: 14 }}>
      <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19 }}>Danh mục ca dùng chung cho các cơ sở. Phân ca cho nhân viên tại Lịch trực cơ sở.</Text>
      <View style={{ gap: 2 }}>
        {ATTENDANCE_SHIFTS.map(s => <KeyValueRow key={s.code} label={`${s.code} · ${s.name}`} value={`${s.start || '—'} – ${s.end || '—'} · ${shiftCreditLabel(s.credit)} công`} emphasize />)}
      </View>
      <FilteredListExport kind="work-shifts" filters="" disabled={false} limitText="Danh mục ca dùng chung, theo đúng mã ca, giờ vào, giờ ra và số công trên web." />
      {session?.user.permissions.includes('hr.read') && <Button size="sm" secondary label="Phân ca tại Lịch trực cơ sở" onPress={() => router.push({ pathname: '/duty-roster', params: store ? { store } : {} })} />}
    </Card>}
  </View>;
}
