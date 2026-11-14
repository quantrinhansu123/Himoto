import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePreventRemove } from 'expo-router';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { REGISTRATION_SHIFTS, registrationDates, registrationMonthRange, registrationCredit, type RegistrationInput, type RegisteredStaff } from '../../../shared/mobile-shift-registration';
import { dutyToday } from '../../../shared/mobile-duty-roster';
import { shiftCreditLabel } from '../../../shared/attendance-shifts';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';
import { Button, Card, InlineError, StateView } from '@/components/ui';
import { ChoiceField, FormField } from '@/components/form-fields';
import { ConfirmEdit } from '@/components/editor-sheet';
import { DateField } from '@/components/date-field';
import { FilteredListExport } from '@/components/filtered-list-export';

function Board() {
  const { api, session } = useSession(), theme = useTheme(), cache = useQueryClient(), running = useRef(false);
  const [month, setMonth] = useState(() => dutyToday().slice(0, 7)), [store, setStore] = useState('all'), [search, setSearch] = useState(''), [day, setDay] = useState(dutyToday);
  const [range,setRange]=useState(()=>registrationMonthRange(month)),[from,setFrom]=useState(range.from),[to,setTo]=useState(range.to),[filterError,setFilterError]=useState('');
  const [pending, setPending] = useState<{ input: RegistrationInput; staff: RegisteredStaff } | null>(null), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState('');
  const query = useQuery({ queryKey: ['shift-registrations', session!.user.id, range.from,range.to], queryFn: ({ signal }) => api!.registrationRange(range.from,range.to, signal), retry: false });
  usePreventRemove(busy, () => {});
  const dates = registrationDates(range.from,range.to), data = query.data, selectedDay = dates.includes(day) ? day : dates[0];
  const writable = session!.user.permissions.includes('hr.write'), locked = busy || query.isFetching || query.isError || uncertain;
  const normalize = (value: string) => value.toLocaleLowerCase('vi');
  const staff = data?.staff.filter(row => (store === 'all' || store === 'none' ? store === 'all' || !row.store_id : String(row.store_id) === store) && normalize(`${row.name} ${row.position}`).includes(normalize(search.trim()))) || [];
  function chooseMonth(value:string){const next=registrationMonthRange(value);setMonth(value);setRange(next);setFrom(next.from);setTo(next.to);setFilterError('');setUncertain(false);setError('');}
  function moveMonth(delta: number) { const [year, value] = month.split('-').map(Number); const next = new Date(Date.UTC(year, value - 1 + delta, 1)).toISOString().slice(0, 7); if (next >= '2000-01' && next <= '2100-12') chooseMonth(next); }
  function applyRange(extend=false){try{registrationDates(from,to);const next=extend?{from:from<range.from?from:range.from,to:to>range.to?to:range.to}:{from,to};registrationDates(next.from,next.to);setRange(next);setFrom(next.from);setTo(next.to);setFilterError('');}catch(cause){setFilterError((cause as Error).message);}}
  async function reload() { if (running.current) return; const result = await query.refetch(); if (!result.isError) { setUncertain(false); setError(''); } }
  async function save() {
    if (!pending || running.current) return;
    running.current = true; setBusy(true); setError(''); const plan = pending; setPending(null);
    try {
      await api!.saveRegistration(plan.input); await query.refetch(); void cache.invalidateQueries({ queryKey: ['self-shift-registration'] });
    } catch (cause) { setError((cause as Error).message + ' Làm mới bảng để đối chiếu trước khi đăng ký tiếp.'); setUncertain(true); }
    finally { running.current = false; setBusy(false); }
  }
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1 }}><FlatList data={staff} keyExtractor={person => String(person.id)} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' }} refreshControl={<RefreshControl refreshing={query.isRefetching} tintColor={theme.primary} onRefresh={() => void reload()} />}
    ListHeaderComponent={<View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: '800' }}>Đăng ký ca</Text>
      <Text style={{ color: theme.muted, lineHeight: 22 }}>Bảng ca làm theo tháng, nhóm nhân viên theo cơ sở. Dùng chung dữ liệu nhân viên đăng ký trong tuần.</Text>
      <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>Tháng đăng ký: {month.slice(5)}/{month.slice(0, 4)}</Text>
      <Button secondary label="Tháng trước" disabled={locked || month === '2000-01'} onPress={() => moveMonth(-1)} /><Button secondary label="Tháng sau" disabled={locked || month === '2100-12'} onPress={() => moveMonth(1)} /><Button secondary label="Đủ ngày trong tháng" disabled={busy} onPress={()=>chooseMonth(month)} /><Button secondary label="Tháng này" disabled={busy} onPress={() => { chooseMonth(dutyToday().slice(0, 7)); setDay(dutyToday()); }} />
      <DateField label="Từ ngày" value={from} onChange={setFrom} disabled={busy} /><DateField label="Đến ngày" value={to} onChange={setTo} disabled={busy} />
      <Button label="Áp dụng bộ lọc" disabled={busy} onPress={()=>applyRange()} /><Button secondary label="Thêm ngày theo bộ lọc" disabled={busy} onPress={()=>applyRange(true)} />
      <Text style={{color:theme.muted,lineHeight:22}}>Chỉ thêm cột hiển thị, không tự điền ca. Tối đa 93 ngày.</Text>{!!filterError&&<InlineError message={filterError}/>}
      <ChoiceField label="Ngày đăng ký" value={selectedDay} choices={dates.map(value => ({ value, label: value.split('-').reverse().join('/') }))} disabled={busy} onChange={setDay} />
      <ChoiceField label="Cơ sở" value={store} searchable choices={[{ value: 'all', label: 'Tất cả cơ sở' }, ...(data?.stores || []).map(s => ({ value: String(s.id), label: s.name })), { value: 'none', label: 'Chưa có cơ sở' }]} onChange={setStore} />
      <FormField label="Tìm nhân viên" placeholder="Họ tên, chức vụ…" value={search} onChangeText={setSearch} maxLength={120} />
      <FilteredListExport kind="shift-registrations" filters={new URLSearchParams({from:range.from,to:range.to,store,search}).toString()} disabled={locked||!staff.length} />
      <Button secondary label="Làm mới bảng" loading={query.isFetching} disabled={busy} onPress={() => void reload()} />
      {!!error && <InlineError message={error} />}
    </View>}
    renderItem={({ item: person }) => {
      const row = data?.registrations.find(r => r.staff_id === person.id && r.work_date === selectedDay);
      return <Card style={{ gap: 12 }}><Text style={{ color: theme.text, fontSize: 19, fontWeight: '700' }}>{person.name}</Text><Text style={{ color: theme.muted }}>{person.position} · {person.store_name}</Text>
        <Text style={{ color: theme.text }}>Tổng công đăng ký trong khoảng ngày: {shiftCreditLabel((data?.registrations || []).filter(r => r.staff_id === person.id&&dates.includes(r.work_date)).reduce((sum, r) => sum + registrationCredit(r.shift_code), 0))} công</Text>
        <ChoiceField label={`Ca của ${person.name} ngày ${selectedDay.split('-').reverse().join('/')}`} value={row?.shift_code || ''} searchable disabled={!writable || locked || !person.store_id || person.status !== 'active'} choices={[{ value: '', label: 'Chưa đăng ký' }, ...REGISTRATION_SHIFTS.map(s => ({ value: s.code, label: `${s.code} · ${s.name}${s.start ? ` (${s.start}–${s.end})` : ''} · ${shiftCreditLabel(s.credit)} công` }))]} onChange={code => { if (code !== (row?.shift_code || '') && person.store_id) setPending({ staff: person, input: { staff_id: person.id, store_id: person.store_id, work_date: selectedDay, shift_code: code || null, revision: row?.revision || null } }); }} />
        {!person.store_id && <Text style={{ color: theme.muted }}>Cần gán cơ sở trong hồ sơ nhân viên trước khi đăng ký.</Text>}
      </Card>;
    }}
    ListEmptyComponent={query.isPending ? <StateView title="Đang tải đăng ký ca…" loading /> : query.isError ? <StateView title="Chưa tải được đăng ký ca" message={query.error.message} retry={() => void reload()} /> : <StateView title="Chưa có nhân sự phù hợp." />}
    ListFooterComponent={<Card style={{gap:12}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:20,fontWeight:'700'}}>Ký hiệu ca làm việc</Text>
      {REGISTRATION_SHIFTS.map(shift=><Text key={shift.code} style={{color:theme.text,lineHeight:23}}>{shift.code} · {shift.name}{shift.start?`: ${shift.start}–${shift.end}`:''}{shift.code==='G1+G3'?' (nghỉ giữa 12:00–17:00)':''} · {shiftCreditLabel(shift.credit)} công</Text>)}
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:20,fontWeight:'700'}}>Chú thích &amp; quy định đăng ký ca</Text>
      {[
        'Mỗi phòng giao dịch sắp xếp 2 nhân sự trong 1 ca làm việc.',
        'Thời gian làm việc cố định: 8 tiếng/1 ca – 4 tiếng/nửa ca.',
        'Sáng: 8h–12h · Chiều: 13h–17h · Tối: 17h–21h.',
        'Nhân sự tự sắp xếp thời gian ăn uống để đảm bảo công việc trực tại văn phòng.',
        'Ưu tiên nghỉ từ thứ Hai đến thứ Năm; nghỉ 1 ngày/tuần, không nghỉ dồn và không nghỉ cuối tuần để đảm bảo phù hợp với công việc.',
        'Thời gian làm việc có thể linh hoạt đến khi kết thúc sự vụ, xử lý các vấn đề hằng ngày liên quan đến khách hàng.',
        'Báo xin đi muộn: trước 7h30 sáng hằng ngày. Báo xin nghỉ: trước 1 ngày.',
        'Nhân viên full-time: 26 ngày công/tháng; làm vượt chỉ tính tối đa 28 ngày công. Nghỉ quá 4 ngày/tháng phải có lý do chính đáng và được cấp trên phê duyệt.',
        'Nhân viên part-time: đăng ký 1 ca G1 hoặc G3, 4 tiếng/ngày; nghỉ 1 ngày/tuần, 4 ngày/tháng. Trường hợp phòng giao dịch thiếu người, trưởng phòng giao dịch có thể điều phối part-time làm thêm.',
        'Đây là chú thích quy định; hệ thống không tự duyệt công hoặc áp dụng giới hạn lương. Tổng công trên bảng chỉ tính ca đã lưu trong khoảng ngày đang hiển thị.',
      ].map(text=><Text key={text} style={{color:theme.muted,lineHeight:23}}>{text}</Text>)}
    </Card>}
  />{pending && <ConfirmEdit title="Lưu đăng ký ca?" message={`${pending.staff.name} · ${pending.input.work_date.split('-').reverse().join('/')}\n${pending.input.shift_code || 'Chưa đăng ký'}`} confirmLabel="Lưu đăng ký ca" onCancel={() => setPending(null)} onConfirm={() => void save()} />}</SafeAreaView>;
}
export default function Route() { const { api, session } = useSession(); return !api || !session || !session.user.permissions.includes('hr.read') ? <StateView title="Không có quyền xem đăng ký ca" /> : <Board key={`${api.origin}:${session.token}:${session.user.permissions.join(',')}`} />; }
