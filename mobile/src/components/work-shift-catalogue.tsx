import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { ATTENDANCE_SHIFTS, shiftCreditLabel } from '../../../shared/attendance-shifts';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';
import { Button, Card } from './ui';
import { FilteredListExport } from './filtered-list-export';

export function WorkShiftCatalogue({ store }: { store?: string }) {
  const [open, setOpen] = useState(false), { session } = useSession(), theme = useTheme();
  return <View style={{ gap: 12 }}>
    <Button secondary label={open ? 'Ẩn ca làm việc' : 'Ca làm việc'} onPress={() => setOpen(value => !value)} />
    {open && <Card style={{ gap: 12 }}><Text style={{ color: theme.muted, lineHeight: 22 }}>Danh mục ca dùng chung cho các cơ sở. Phân ca cho nhân viên tại Lịch trực cơ sở.</Text>
      <FilteredListExport kind="work-shifts" filters="" disabled={false} limitText="Danh mục ca dùng chung, theo đúng mã ca, giờ vào, giờ ra và số công trên web." />
      {ATTENDANCE_SHIFTS.map(s => <Text key={s.code} style={{ color: theme.text, lineHeight: 24 }}>{s.code} · {s.name} · {s.start || '—'} – {s.end || '—'} · {shiftCreditLabel(s.credit)} công</Text>)}
      {session?.user.permissions.includes('hr.read') && <Button secondary label="Phân ca tại Lịch trực cơ sở" onPress={() => router.push({ pathname: '/duty-roster', params: store ? { store } : {} })} />}
    </Card>}
  </View>;
}
