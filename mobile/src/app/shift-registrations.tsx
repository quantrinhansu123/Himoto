import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, usePreventRemove } from 'expo-router';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react-native';
import { REGISTRATION_SHIFTS, registrationDates, registrationMonthRange, registrationCredit, type RegistrationInput, type RegisteredStaff, type ShiftRegistration } from '../../../shared/mobile-shift-registration';
import { dutyToday } from '../../../shared/mobile-duty-roster';
import { shiftCreditLabel } from '../../../shared/attendance-shifts';
import { useSession } from '@/providers/session';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useTheme } from '@/theme';
import { Button, Card, Chip, InlineError, KeyValueRow, SegmentedBar, SkeletonList, StateView, StatusBadge } from '@/components/ui';
import { ChoiceField } from '@/components/form-fields';
import { ConfirmEdit } from '@/components/editor-sheet';
import { DateField } from '@/components/date-field';
import { FilteredListExport } from '@/components/filtered-list-export';

function Board({ initialDate, initialStaff }: { initialDate?: string; initialStaff?: string }) {
  const { api, session } = useSession(), theme = useTheme(), cache = useQueryClient(), running = useRef(false);
  const validInitialDate = initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : undefined;
  const [month, setMonth] = useState(() => (validInitialDate || dutyToday()).slice(0, 7)), [store, setStore] = useState('all'), [search, setSearch] = useState(initialStaff || ''), [day, setDay] = useState(() => validInitialDate || dutyToday());
  const [viewMode, setViewMode] = useState<'day' | 'matrix'>('day');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [range,setRange]=useState(()=>registrationMonthRange(month)),[from,setFrom]=useState(range.from),[to,setTo]=useState(range.to),[filterError,setFilterError]=useState('');
  const [pending, setPending] = useState<{ input: RegistrationInput; staff: RegisteredStaff } | null>(null), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState('');
  const query = useQuery({ queryKey: ['shift-registrations', session!.user.id, range.from,range.to], queryFn: ({ signal }) => api!.registrationRange(range.from,range.to, signal), retry: false });
  usePreventRemove(busy, () => {});
  const dates = useMemo(() => registrationDates(range.from,range.to), [range.from, range.to]), data = query.data, selectedDay = dates.includes(day) ? day : dates[0];
  const writable = session!.user.permissions.includes('hr.write'), locked = busy || query.isFetching || query.isError || uncertain;
  const debouncedSearch = useDebouncedValue(search, 250);
  const staff = useMemo(() => {
    const normalize = (value: string) => value.toLocaleLowerCase('vi');
    const needle = normalize(debouncedSearch.trim());
    return data?.staff.filter(row => (store === 'all' || store === 'none' ? store === 'all' || !row.store_id : String(row.store_id) === store) && (!needle || normalize(`${row.name} ${row.position}`).includes(needle))) || [];
  }, [data?.staff, store, debouncedSearch]);
  const { byStaffDay, creditsByStaff } = useMemo(() => {
    const dateSet = new Set(dates);
    const cellMap = new Map<string, ShiftRegistration>();
    const creditMap = new Map<number, number>();
    for (const r of data?.registrations || []) {
      cellMap.set(`${r.staff_id}:${r.work_date}`, r);
      if (dateSet.has(r.work_date)) creditMap.set(r.staff_id, (creditMap.get(r.staff_id) || 0) + registrationCredit(r.shift_code));
    }
    return { byStaffDay: cellMap, creditsByStaff: creditMap };
  }, [data?.registrations, dates]);
  const shiftChoices = useMemo(() => [{ value: '', label: 'Chưa đăng ký' }, ...REGISTRATION_SHIFTS.map(s => ({ value: s.code, label: `${s.code} · ${s.name}${s.start ? ` (${s.start}–${s.end})` : ''} · ${shiftCreditLabel(s.credit)} công` }))], []);
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
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background }}><FlatList data={staff} keyExtractor={person => String(person.id)} initialNumToRender={10} maxToRenderPerBatch={10} windowSize={5} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 11, maxWidth: 760, width: '100%', alignSelf: 'center' }} refreshControl={<RefreshControl refreshing={query.isRefetching} tintColor={theme.primary} onRefresh={() => void reload()} />}
    ListHeaderComponent={<View style={{ gap: 11 }}>
      <View style={{ gap: 2 }}>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Bảng đăng ký ca</Text>
        <Text style={{ color: theme.muted, fontSize: 12.5 }}>{staff.length} nhân sự · {dates.length} ngày ({range.from.split('-').reverse().join('/')} → {range.to.split('-').reverse().join('/')})</Text>
      </View>
      {/* Compact Month Stepper */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 11, padding: 6 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Tháng trước" disabled={locked || month === '2000-01'} onPress={() => moveMonth(-1)} style={{ minWidth: 38, minHeight: 36, borderRadius: 8, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', opacity: locked || month === '2000-01' ? 0.4 : 1 }}>
          <ChevronLeft size={18} color={theme.text} />
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { chooseMonth(dutyToday().slice(0, 7)); setDay(dutyToday()); }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 }}>
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>Tháng {month.slice(5)}/{month.slice(0, 4)}</Text>
          <Text style={{ color: theme.primary, fontSize: 11.5, fontWeight: '600' }}>Chạm để về tháng này</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Tháng sau" disabled={locked || month === '2100-12'} onPress={() => moveMonth(1)} style={{ minWidth: 38, minHeight: 36, borderRadius: 8, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', opacity: locked || month === '2100-12' ? 0.4 : 1 }}>
          <ChevronRight size={18} color={theme.text} />
        </Pressable>
      </View>
      <SegmentedBar value={viewMode} onChange={setViewMode} options={[{ value: 'day', label: 'Đăng ký theo ngày' }, { value: 'matrix', label: 'Bảng nhiều ngày' }]} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, borderColor: theme.controlBorder, backgroundColor: theme.surface, paddingHorizontal: 11, minHeight: 44 }}>
          <Search size={18} color={theme.muted} accessible={false} />
          <TextInput
            accessibilityLabel="Tìm nhân viên"
            placeholder="Tìm họ tên, chức vụ…"
            placeholderTextColor={theme.muted}
            value={search}
            onChangeText={setSearch}
            maxLength={120}
            autoCorrect={false}
            style={{ flex: 1, color: theme.text, fontSize: 14.5, paddingVertical: 8 }}
          />
          {!!search && <Pressable accessibilityRole="button" onPress={() => setSearch('')} hitSlop={8}><X size={17} color={theme.muted} /></Pressable>}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Bộ lọc khoảng ngày và cơ sở" onPress={() => setFiltersOpen(v => !v)} style={{ minWidth: 44, minHeight: 44, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: filtersOpen || store !== 'all' ? theme.primary : theme.controlBorder, backgroundColor: filtersOpen || store !== 'all' ? theme.tint : theme.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <SlidersHorizontal size={18} color={filtersOpen || store !== 'all' ? theme.primary : theme.text} />
        </Pressable>
      </View>
      {filtersOpen && (
        <Card style={{ gap: 10 }}>
          <ChoiceField label="Cơ sở" value={store} searchable choices={[{ value: 'all', label: 'Tất cả cơ sở' }, ...(data?.stores || []).map(s => ({ value: String(s.id), label: s.name })), { value: 'none', label: 'Chưa có cơ sở' }]} onChange={setStore} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><DateField label="Từ ngày" value={from} onChange={setFrom} disabled={busy} /></View>
            <View style={{ flex: 1 }}><DateField label="Đến ngày" value={to} onChange={setTo} disabled={busy} /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button size="sm" equalWidth label="Áp dụng ngày" disabled={busy} onPress={() => applyRange()} />
            <Button size="sm" equalWidth secondary label="Mở rộng ngày" disabled={busy} onPress={() => applyRange(true)} />
          </View>
          <Button size="sm" secondary label="Đủ ngày trong tháng" disabled={busy} onPress={() => chooseMonth(month)} />
          <FilteredListExport kind="shift-registrations" filters={new URLSearchParams({from:range.from,to:range.to,store,search}).toString()} disabled={locked||!staff.length} />
          {!!filterError && <InlineError message={filterError} />}
        </Card>
      )}
      <ChoiceField label="Ngày đang chọn" value={selectedDay} choices={dates.map(value => ({ value, label: value.split('-').reverse().join('/') }))} disabled={busy} onChange={setDay} />
      {!!(search || store !== 'all') && (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Chip label="Xóa lọc nhân viên" onPress={() => { setSearch(''); setStore('all'); }} />
        </View>
      )}
      {!!error && <InlineError message={error} />}
    </View>}
    renderItem={({ item: person }) => {
      const row = byStaffDay.get(`${person.id}:${selectedDay}`);
      return <Card style={{ gap: 9, padding: 13 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800', flex: 1 }}>{person.name}</Text>
          {person.status !== 'active' ? (
            <StatusBadge status="cancelled" label="Ngừng HĐ" />
          ) : (
            <StatusBadge status={row?.shift_code ? 'active' : 'draft'} label={row?.shift_code || 'Chưa ĐK'} />
          )}
        </View>
        <Text style={{ color: theme.muted, fontSize: 12.5 }}>{person.position} · {person.store_name}</Text>
        <KeyValueRow label="Tổng công trong khoảng ngày" strong value={`${shiftCreditLabel(creditsByStaff.get(person.id) || 0)} công`} />
        {viewMode === 'matrix' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
            {dates.map(d => {
              const cell = byStaffDay.get(`${person.id}:${d}`);
              const activeDay = d === selectedDay;
              return (
                <Pressable key={d} onPress={() => setDay(d)} style={{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: activeDay ? theme.primary : theme.border, backgroundColor: activeDay ? theme.tint : theme.background, alignItems: 'center', minWidth: 50 }}>
                  <Text style={{ color: theme.muted, fontSize: 11 }}>{d.slice(8, 10)}/{d.slice(5, 7)}</Text>
                  <Text style={{ color: cell?.shift_code ? theme.primary : theme.muted, fontSize: 13, fontWeight: '800' }}>{cell?.shift_code || '—'}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
        <ChoiceField label={`Ca ngày ${selectedDay.split('-').reverse().join('/')}`} value={row?.shift_code || ''} searchable disabled={!writable || locked || !person.store_id || person.status !== 'active'} choices={shiftChoices} onChange={code => { if (code !== (row?.shift_code || '') && person.store_id) setPending({ staff: person, input: { staff_id: person.id, store_id: person.store_id, work_date: selectedDay, shift_code: code || null, revision: row?.revision || null } }); }} />
        {!person.store_id && <Text style={{ color: theme.muted, fontSize: 12 }}>Cần gán cơ sở trong hồ sơ nhân viên trước khi đăng ký.</Text>}
      </Card>;
    }}
    ListEmptyComponent={query.isPending ? <SkeletonList count={4} lines={3} /> : query.isError ? <StateView title="Chưa tải được đăng ký ca" message={query.error.message} retry={() => void reload()} /> : <StateView title="Chưa có nhân sự phù hợp." />}
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
export default function Route() {
  const { api, session } = useSession();
  const { date, staff } = useLocalSearchParams<{ date?: string; staff?: string }>();
  return !api || !session || !session.user.permissions.includes('hr.read')
    ? <StateView title="Không có quyền xem đăng ký ca" />
    : <Board key={`${api.origin}:${session.token}:${session.user.permissions.join(',')}:${date || ''}:${staff || ''}`} initialDate={typeof date === 'string' ? date : undefined} initialStaff={typeof staff === 'string' ? staff : undefined} />;
}
