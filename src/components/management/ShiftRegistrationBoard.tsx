'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { dutyRequest, vietnamDate } from '@/lib/management/duty-roster';
import { monthDates, REGISTRATION_SHIFTS, registrationCredit, type RegisteredStaff, type RegistrationMonth, type ShiftRegistration } from '@/lib/management/shift-registration';
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
  const [store, setStore] = useState('all');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<RegistrationMonth | null>(null);
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
    dutyRequest<RegistrationMonth>(`/api/auth/duty-roster/registrations?month=${month}`, 'GET', undefined, controller.signal)
      .then(result => {
        if (result.month !== month || !Array.isArray(result.staff) || !Array.isArray(result.registrations) || !Array.isArray(result.stores)) throw new Error('Bảng đăng ký trả về không hợp lệ.');
        if (!controller.signal.aborted) setData(result);
      }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được bảng đăng ký.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [month, reload]);
  const dates = useMemo(() => monthDates(month), [month]);
  const cells = useMemo(() => new Map(data?.registrations.map(row => [keyOf(row.staff_id, row.work_date), row])), [data]);
  const people = useMemo(() => (data?.staff || []).filter(person => (store === 'all' || (store === 'none' ? person.store_id === null : String(person.store_id) === store)) && `${person.name} ${person.position}`.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'))), [data, store, search]);
  const groups = useMemo(() => {
    const result = new Map<string, RegisteredStaff[]>();
    for (const person of people) { const key = String(person.store_id ?? 'none'); result.set(key, [...(result.get(key) || []), person]); }
    return [...result.values()];
  }, [people]);
  const total = (person: RegisteredStaff) => dates.reduce((sum, date) => sum + registrationCredit(cells.get(keyOf(person.id, date))?.shift_code), 0);
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
  return <section className="mg-page" aria-label="Đăng ký ca làm việc"><div className="mg-page-content">
    <div className="mg-page-heading"><div><div className="mg-eyebrow">QUẢN LÝ NHÂN SỰ</div><h1>Bảng đăng ký ca làm việc</h1><p>Chọn ca trực tiếp trên từng ngày. Mỗi thay đổi được lưu ngay vào hệ thống.</p></div><div className="mg-heading-actions">
      <FilteredExcelButton filename={`himoto-dang-ky-ca-${month}`} disabled={unavailable || !people.length || Boolean(pending)} headers={['Địa điểm làm việc', 'Họ và tên', 'Chức vụ', ...dates.map(date => date.split('-').reverse().join('/')), 'Tổng công đăng ký']} getRows={() => people.map(person => [person.store_name, person.name, person.position, ...dates.map(date => cells.get(keyOf(person.id, date))?.shift_code || ''), total(person)])} />
      <button type="button" className="mg-button" disabled={loading || Boolean(pending)} onClick={refresh}><RotateCcw size={16} />Làm mới</button>
    </div></div>
    <div className={styles.toolbar}>
      <div className={styles.month}><button type="button" className="mg-button" disabled={Boolean(pending) || month === '2000-01'} aria-label="Tháng trước" onClick={() => setMonth(adjacentMonth(month, -1))}><ChevronLeft size={18} /></button>
        <label>Tháng đăng ký<input type="month" min="2000-01" max="2100-12" value={month} disabled={Boolean(pending)} onChange={event => { try { monthDates(event.target.value); setMonth(event.target.value); } catch { /* Keep the last valid month while typing. */ } }} /></label>
        <button type="button" className="mg-button" disabled={Boolean(pending) || month === '2100-12'} aria-label="Tháng sau" onClick={() => setMonth(adjacentMonth(month, 1))}><ChevronRight size={18} /></button>
        <button type="button" className="mg-button" disabled={Boolean(pending)} onClick={() => setMonth(vietnamDate().slice(0, 7))}>Tháng này</button></div>
      <label>Cơ sở<select value={store} onChange={event => setStore(event.target.value)}><option value="all">Tất cả cơ sở</option>{data?.stores.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="none">Chưa có cơ sở</option></select></label>
      <label>Tìm nhân viên<input type="search" placeholder="Họ tên, chức vụ…" value={search} onChange={event => setSearch(event.target.value)} /></label>
    </div>
    <div className={styles.summary}><span><strong>{people.length}</strong> nhân viên</span><span><strong>{dates.length}</strong> ngày</span><span>{writable ? 'Chọn mã ca để đăng ký · Ô trống = chưa đăng ký' : 'Bạn có quyền xem bảng, không có quyền sửa ca.'}</span></div>
    <p className={styles.status} role="status" aria-live="polite">{loading ? 'Đang tải bảng đăng ký ca…' : pending ? 'Đang lưu đăng ký…' : saved || 'Công đăng ký là dự kiến, không thay thế công chấm và công được duyệt.'}</p>
    {error && <div role="alert" className="mg-field-error">{error} <button type="button" className="mg-button" disabled={Boolean(pending)} onClick={refresh}>Tải lại để kiểm tra</button></div>}
    {data && <div className={styles.scroll} role="region" aria-label={`Bảng đăng ký ca tháng ${month}`} tabIndex={0} aria-busy={Boolean(pending)}>
      <table className={styles.table}><caption className={styles.caption}>Đăng ký ca tháng {month.slice(5)}/{month.slice(0, 4)}</caption><thead><tr>
        <th scope="col" className={styles.store}>Địa điểm làm việc</th><th scope="col" className={styles.name}>Họ và tên</th><th scope="col" className={styles.position}>Chức vụ</th>
        {dates.map(date => { const day = new Date(`${date}T00:00:00Z`).getUTCDay(); return <th scope="col" key={date} className={`${day === 0 ? styles.sunday : ''} ${date === vietnamDate() ? styles.today : ''}`}><strong>{Number(date.slice(8))}/{Number(month.slice(5))}</strong><small>{dayNames[day]}</small></th>; })}<th scope="col" className={styles.total}>Tổng công</th>
      </tr></thead><tbody>{groups.map((group, groupIndex) => group.map((person, index) => <tr key={person.id} className={styles[`group${groupIndex % 5}`]}>
        {index === 0 && <th scope="rowgroup" rowSpan={group.length} className={styles.store}>{person.store_name}</th>}
        <th scope="row" className={styles.name}>{person.name}{person.status !== 'active' && <small>Ngừng hoạt động</small>}</th><td className={styles.position}>{person.position || '—'}</td>
        {dates.map(date => { const key = keyOf(person.id, date), code = cells.get(key)?.shift_code || ''; return <td key={date} className={`${date === vietnamDate() ? styles.today : ''} ${pending === key ? styles.pending : ''}`}>
          <select aria-label={`Ca của ${person.name} ngày ${date.split('-').reverse().join('/')}`} title={!person.store_id ? 'Cần gán cơ sở trong hồ sơ nhân viên trước khi đăng ký' : `${person.name} · ${date}`} className={`${styles.shift} ${code === 'O' ? styles.off : code === 'F' ? styles.full : code ? styles.working : ''}`} disabled={!writable || unavailable || Boolean(pending) || !person.store_id || person.status !== 'active'} value={code} onChange={event => void register(person, date, event.target.value)}>
            <option value="">—</option>{REGISTRATION_SHIFTS.map(shift => <option key={shift.code} value={shift.code}>{shift.code}</option>)}
          </select></td>; })}<td className={styles.total}><strong>{shiftCreditLabel(total(person))}</strong></td>
      </tr>))}{!people.length && <tr><td colSpan={dates.length + 4} className={styles.empty}>Không có nhân viên phù hợp.</td></tr>}</tbody></table>
    </div>}
    <div className={styles.notes}><div><h2>Ký hiệu ca làm việc</h2><table className={styles.legend}><thead><tr><th>Ký hiệu</th><th>Chú thích</th><th>Tính công</th></tr></thead><tbody>{REGISTRATION_SHIFTS.map(shift => <tr key={shift.code}><td><b className={shift.code === 'O' ? styles.off : shift.code === 'F' ? styles.full : styles.working}>{shift.code}</b></td><td>{shift.name}{shift.start && `: ${shift.start}–${shift.end}`}{shift.code === 'G1+G3' && ' (nghỉ giữa 12:00–17:00)'}</td><td>{shiftCreditLabel(shift.credit)}</td></tr>)}</tbody></table></div>
      <div><h2>Hướng dẫn đăng ký</h2><ul><li>Bảng nhóm nhân viên theo cơ sở trong hồ sơ nhân sự.</li><li>Chọn mã trong từng ô để đăng ký; chọn “—” để bỏ đăng ký. Mã O là ngày nghỉ đã đăng ký.</li><li>Ca S: 8h–17h; ca G1/G2/G3 là nửa ca; F là cả ngày; G1+G3 là sáng và tối.</li><li>Tổng công chỉ tính các ca đã lưu thành công trong tháng.</li><li>Không tự điền ca, không thay đổi lịch trực tuần hoặc dữ liệu chấm công hiện có.</li><li>Người có quyền quản lý nhân sự được đăng ký; mọi lần đổi ca đều lưu người thực hiện và lịch sử.</li></ul></div>
    </div>
  </div></section>;
}
