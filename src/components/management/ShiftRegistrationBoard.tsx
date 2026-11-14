'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, RotateCcw } from 'lucide-react';
import { dutyRequest, vietnamDate } from '@/lib/management/duty-roster';
import { registrationDates, registrationMonthRange, registrationExcel, REGISTRATION_SHIFTS, registrationCredit, type RegisteredStaff, type RegistrationRange, type ShiftRegistration } from '@/lib/management/shift-registration';
import { shiftCreditLabel } from '@/lib/management/attendance-shifts';
import { FilteredExcelButton } from './FilteredExcelButton';
import { useManagement } from './ManagementProvider';
import { useReloadAction } from './ReloadButton';
import styles from './ShiftRegistrationBoard.module.css';

const keyOf = (staff: number, date: string) => `${staff}:${date}`;
const dayNames = ['CN', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
function adjacentMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export function ShiftRegistrationBoard() {
  const { can, notify } = useManagement();
  const [month, setMonth] = useState(() => vietnamDate().slice(0, 7));
  const [range, setRange] = useState(() => registrationMonthRange(month));
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [filterError, setFilterError] = useState('');
  const [fitMonth, setFitMonth] = useState(true);
  const [store, setStore] = useState('all');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<RegistrationRange | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState('');
  const [saved, setSaved] = useState('');
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = useCallback(() => { if (!lock.current) setReload(value => value + 1); }, []);
  useReloadAction(refresh);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setSaved(''); setData(null);
    dutyRequest<RegistrationRange>(`/api/auth/duty-roster/registrations?${new URLSearchParams(range)}`, 'GET', undefined, controller.signal)
      .then(result => {
        if (result.from !== range.from || result.to !== range.to || !Array.isArray(result.staff) || !Array.isArray(result.registrations) || !Array.isArray(result.stores)) throw new Error('Bảng đăng ký trả về không hợp lệ.');
        if (!controller.signal.aborted) setData(result);
      }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được bảng đăng ký.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [range, reload]);
  const dates = useMemo(() => registrationDates(range.from, range.to), [range]);
  function chooseMonth(value: string) {
    if (lock.current) return;
    try {
      const next = registrationMonthRange(value);
      setMonth(value); setRange(next); setFrom(next.from); setTo(next.to); setFilterError(''); setFitMonth(true);
    } catch { /* Keep the last valid month while typing. */ }
  }
  function applyFilter(extend = false) {
    if (lock.current) return;
    try {
      registrationDates(from, to);
      const next = extend ? { from: from < range.from ? from : range.from, to: to > range.to ? to : range.to } : { from, to };
      const nextDates = registrationDates(next.from, next.to);
      setRange(next); setFrom(next.from); setTo(next.to); setFilterError(''); setFitMonth(nextDates.length <= 31);
    } catch (cause) { setFilterError(cause instanceof Error ? cause.message : 'Khoảng ngày không hợp lệ.'); }
  }
  const cells = useMemo(() => new Map(data?.registrations.map(row => [keyOf(row.staff_id, row.work_date), row])), [data]);
  const people = useMemo(() => (data?.staff || []).filter(person => (store === 'all' || (store === 'none' ? person.store_id === null : String(person.store_id) === store)) && `${person.name} ${person.position}`.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'))), [data, store, search]);
  const groups = useMemo(() => {
    const result = new Map<string, RegisteredStaff[]>();
    for (const person of people) { const key = String(person.store_id ?? 'none'); result.set(key, [...(result.get(key) || []), person]); }
    return [...result.values()];
  }, [people]);
  const total = (person: RegisteredStaff) => dates.reduce((sum, date) => sum + registrationCredit(cells.get(keyOf(person.id, date))?.shift_code), 0);
  const excel=data?registrationExcel(data,store,search):{headers:[],rows:[]};
  const unavailable = loading || Boolean(error) || !data;
  const writable = can('hr.write');
  async function register(person: RegisteredStaff, date: string, code: string) {
    if (lock.current || unavailable || !writable || !person.store_id) return;
    const key = keyOf(person.id, date), previous = cells.get(key);
    if ((previous?.shift_code ?? '') === code) return;
    lock.current = true; setPending(key); setSaved('');
    try {
      const row = await dutyRequest<ShiftRegistration>('/api/auth/duty-roster/registrations', 'PUT', { staff_id: person.id, store_id: person.store_id, work_date: date, shift_code: code || null, revision: previous?.revision ?? null });
      if (row.staff_id !== person.id || row.work_date !== date || row.shift_code !== (code || null) || typeof row.revision !== 'string') throw new Error('Chưa xác nhận được ca đã lưu. Làm mới để kiểm tra.');
      if (mounted.current) {
        setData(current => current && { ...current, registrations: [...current.registrations.filter(item => keyOf(item.staff_id, item.work_date) !== key), row] });
        setSaved(`Đã lưu ${person.name} · ${date.split('-').reverse().join('/')} · ${code || 'bỏ đăng ký'}`);
      }
    } catch (cause) {
      if (mounted.current) { const message = cause instanceof Error ? cause.message : 'Chưa lưu được ca.'; setError(message); notify(message); }
    } finally { lock.current = false; if (mounted.current) setPending(''); }
  }
  return <section className="mg-page mg-shift-registration-page" aria-label="Đăng ký ca làm việc"><div className="mg-page-content">
    <div className="mg-page-heading"><div><div className="mg-eyebrow">QUẢN LÝ NHÂN SỰ</div><h1>Đăng ký ca</h1><p>Bảng ca làm theo tháng, nhóm nhân viên theo cơ sở. Dùng chung dữ liệu nhân viên đăng ký trong tuần.</p></div><div className="mg-heading-actions">
      <FilteredExcelButton filename={`himoto-dang-ky-ca-${range.from}-${range.to}`} disabled={unavailable || !people.length || Boolean(pending)} headers={excel.headers} getRows={()=>excel.rows} />
      <button type="button" className="mg-button" disabled={loading || Boolean(pending)} onClick={refresh}><RotateCcw size={16} />Làm mới</button>
    </div></div>
    <div className={styles.toolbar}>
      <div className={styles.month}><button type="button" className="mg-button" disabled={Boolean(pending) || month === '2000-01'} aria-label="Tháng trước" onClick={() => chooseMonth(adjacentMonth(month, -1))}><ChevronLeft size={18} /></button>
        <label>Tháng đăng ký<input type="month" min="2000-01" max="2100-12" value={month} disabled={Boolean(pending)} onChange={event => chooseMonth(event.target.value)} /></label>
        <button type="button" className="mg-button" disabled={Boolean(pending) || month === '2100-12'} aria-label="Tháng sau" onClick={() => chooseMonth(adjacentMonth(month, 1))}><ChevronRight size={18} /></button>
        <button type="button" className="mg-button" disabled={Boolean(pending)} onClick={() => chooseMonth(month)}>Đủ ngày trong tháng</button>
        <button type="button" className="mg-button" disabled={Boolean(pending)} onClick={() => chooseMonth(vietnamDate().slice(0, 7))}>Tháng này</button></div>
      <label>Cơ sở<select value={store} onChange={event => setStore(event.target.value)}><option value="all">Tất cả cơ sở</option>{data?.stores.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="none">Chưa có cơ sở</option></select></label>
      <label>Tìm nhân viên<input type="search" placeholder="Họ tên, chức vụ…" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <div className={styles.range} role="group" aria-label="Bộ lọc ngày đăng ký ca">
        <label>Từ ngày<input type="date" min="2000-01-01" max="2100-12-31" value={from} disabled={Boolean(pending)} onChange={event => setFrom(event.target.value)} /></label>
        <label>Đến ngày<input type="date" min="2000-01-01" max="2100-12-31" value={to} disabled={Boolean(pending)} onChange={event => setTo(event.target.value)} /></label>
        <button type="button" className="mg-button mg-button-primary" disabled={Boolean(pending)} onClick={() => applyFilter()}>Áp dụng bộ lọc</button>
        <button type="button" className="mg-button" disabled={Boolean(pending)} onClick={() => applyFilter(true)}><Plus size={16} />Thêm ngày theo bộ lọc</button>
        <span>Chỉ thêm cột hiển thị, không tự điền ca. Tối đa 93 ngày.</span>
      </div>
      {filterError && <p className="mg-field-error" role="alert">{filterError}</p>}
    </div>
    <div className={styles.summary}><span><strong>{people.length}</strong> nhân viên</span><span><strong>{dates.length}</strong> ngày · {range.from.split('-').reverse().join('/')} – {range.to.split('-').reverse().join('/')}</span><label><input type="checkbox" checked={fitMonth} disabled={dates.length > 31} onChange={event => setFitMonth(event.target.checked)} /> Thu gọn xem trọn tháng (máy tính)</label><span>{writable ? 'Chọn mã ca để đăng ký · Ô trống = chưa đăng ký' : 'Bạn có quyền xem bảng, không có quyền sửa ca.'}</span></div>
    <p className={styles.status} role="status" aria-live="polite">{loading ? 'Đang tải bảng đăng ký ca…' : pending ? 'Đang lưu đăng ký…' : saved || 'Công đăng ký là dự kiến, không thay thế công chấm và công được duyệt.'}</p>
    {error && <div role="alert" className="mg-field-error">{error} <button type="button" className="mg-button" disabled={Boolean(pending)} onClick={refresh}>Tải lại để kiểm tra</button></div>}
    {data && <div className={`${styles.scroll} ${fitMonth ? styles.fit : ''}`} role="region" aria-label={`Bảng đăng ký ca từ ${range.from} đến ${range.to}`} tabIndex={0} aria-busy={Boolean(pending)}>
      <table className={styles.table}><caption className={styles.caption}>Đăng ký ca từ {range.from} đến {range.to}</caption><thead><tr>
        <th scope="col" className={styles.store}>Địa điểm làm việc</th><th scope="col" className={styles.name}>Họ và tên</th><th scope="col" className={styles.position}>Chức vụ</th>
        {dates.map(date => { const day = new Date(`${date}T00:00:00Z`).getUTCDay(); return <th scope="col" key={date} title={`${dayNames[day]} · ${date.split('-').reverse().join('/')}`} className={`${day === 0 ? styles.sunday : ''} ${date === vietnamDate() ? styles.today : ''}`}><strong>{Number(date.slice(8))}/{Number(date.slice(5, 7))}</strong><small>{fitMonth ? day === 0 ? 'CN' : `T${day + 1}` : dayNames[day]}</small></th>; })}<th scope="col" className={styles.total}>Tổng công</th>
      </tr></thead><tbody>{groups.map((group, groupIndex) => group.map((person, index) => <tr key={person.id} className={styles[`group${groupIndex % 5}`]}>
        {index === 0 && <th scope="rowgroup" rowSpan={group.length} className={styles.store}>{person.store_name}</th>}
        <th scope="row" className={styles.name}>{person.name}{person.status !== 'active' && <small>Ngừng hoạt động</small>}</th><td className={styles.position}>{person.position || '—'}</td>
        {dates.map(date => { const key = keyOf(person.id, date), code = cells.get(key)?.shift_code || ''; return <td key={date} className={`${date === vietnamDate() ? styles.today : ''} ${pending === key ? styles.pending : ''}`}>
          <select aria-label={`Ca của ${person.name} ngày ${date.split('-').reverse().join('/')}`} title={!person.store_id ? 'Cần gán cơ sở trong hồ sơ nhân viên trước khi đăng ký' : `${person.name} · ${date} · ${code || 'Chưa đăng ký'}`} className={`${styles.shift} ${code === 'O' ? styles.off : code === 'F' ? styles.full : code ? styles.working : ''}`} disabled={!writable || unavailable || Boolean(pending) || !person.store_id || person.status !== 'active'} value={code} onChange={event => void register(person, date, event.target.value)}>
            <option value="">—</option>{REGISTRATION_SHIFTS.map(shift => <option key={shift.code} value={shift.code}>{shift.code}</option>)}
          </select></td>; })}<td className={styles.total}><strong>{shiftCreditLabel(total(person))}</strong></td>
      </tr>))}{!people.length && <tr><td colSpan={dates.length + 4} className={styles.empty}>Không có nhân viên phù hợp.</td></tr>}</tbody></table>
    </div>}
    <div className={styles.notes}><div><h2>Ký hiệu ca làm việc</h2><table className={styles.legend}><thead><tr><th>Ký hiệu</th><th>Chú thích</th><th>Tính công</th></tr></thead><tbody>{REGISTRATION_SHIFTS.map(shift => <tr key={shift.code}><td><b className={shift.code === 'O' ? styles.off : shift.code === 'F' ? styles.full : styles.working}>{shift.code}</b></td><td>{shift.name}{shift.start && `: ${shift.start}–${shift.end}`}{shift.code === 'G1+G3' && ' (nghỉ giữa 12:00–17:00)'}</td><td>{shiftCreditLabel(shift.credit)}</td></tr>)}</tbody></table></div>
      <div><h2>Chú thích &amp; quy định đăng ký ca</h2><p><strong>Mỗi phòng giao dịch sắp xếp 2 nhân sự trong 1 ca làm việc.</strong></p><p><strong>Thời gian làm việc cố định: 8 tiếng/1 ca – 4 tiếng/nửa ca.</strong></p><ul>
        <li>Sáng: 8h–12h · Chiều: 13h–17h · Tối: 17h–21h.</li>
        <li>Nhân sự tự sắp xếp thời gian ăn uống để đảm bảo công việc trực tại văn phòng.</li>
        <li>Ưu tiên nghỉ từ thứ Hai đến thứ Năm; nghỉ 1 ngày/tuần, không nghỉ dồn và không nghỉ cuối tuần để đảm bảo phù hợp với công việc.</li>
        <li>Thời gian làm việc có thể linh hoạt đến khi kết thúc sự vụ, xử lý các vấn đề hằng ngày liên quan đến khách hàng.</li>
        <li>Báo xin đi muộn: trước 7h30 sáng hằng ngày. Báo xin nghỉ: trước 1 ngày.</li>
        <li>Nhân viên full-time: 26 ngày công/tháng; làm vượt chỉ tính tối đa 28 ngày công. Nghỉ quá 4 ngày/tháng phải có lý do chính đáng và được cấp trên phê duyệt.</li>
        <li>Nhân viên part-time: đăng ký 1 ca G1 hoặc G3, 4 tiếng/ngày; nghỉ 1 ngày/tuần, 4 ngày/tháng. Trường hợp phòng giao dịch thiếu người, trưởng phòng giao dịch có thể điều phối part-time làm thêm.</li>
      </ul><p className={styles.disclaimer}>Đây là chú thích quy định; hệ thống không tự duyệt công hoặc áp dụng giới hạn lương. Tổng công trên bảng chỉ tính ca đã lưu trong khoảng ngày đang hiển thị.</p></div>
    </div>
  </div></section>;
}
