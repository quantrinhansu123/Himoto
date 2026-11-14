'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, dutyRequest, DutyRequestError, vietnamDate, weekStart } from '@/lib/management/duty-roster';
import { registrationCredit } from '@/lib/management/shift-registration';
import type { SelfRegistrationWeek } from '@/lib/management/self-shift-registration';
import { shiftCreditLabel } from '@/lib/management/attendance-shifts';
import { Dialog } from './Dialog';
import { ShiftSearchPicker } from './ShiftSearchPicker';
import styles from './WeeklyShiftRegistrationDialog.module.css';

const dateLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('vi-VN', { timeZone: 'UTC', day: '2-digit', month: '2-digit' });
export function WeeklyShiftRegistrationDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [week, setWeek] = useState(() => weekStart(vietnamDate()));
  const [data, setData] = useState<SelfRegistrationWeek | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [reload, setReload] = useState(0);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const lock = useRef(false);
  const apply = (result: SelfRegistrationWeek) => {
    setData(result);
    setDraft(Object.fromEntries(result.dates.map(date => [date, result.registrations.find(row => row.work_date === date)?.shift_code || ''])));
  };
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setUncertain(false); setData(null); setDraft({}); setActiveDate(null);
    dutyRequest<SelfRegistrationWeek>(`/api/auth/attendance/shift-registration?week=${week}`, 'GET', undefined, controller.signal).then(result => {
      if (result.week !== week || !Array.isArray(result.dates) || result.dates.length !== 7 || !Array.isArray(result.registrations) || !result.staff?.id) throw new Error('Thông tin tuần đăng ký chưa hợp lệ.');
      if (!controller.signal.aborted) apply(result);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được ca trong tuần.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [week, reload]);
  const changed = data?.dates.filter(date => date >= data.today && (draft[date] || '') !== (data.registrations.find(row => row.work_date === date)?.shift_code || '')) || [];
  const unavailable = loading || saving || uncertain || !data;
  async function save() {
    if (lock.current || unavailable || !data || !changed.length) return;
    lock.current = true; setSaving(true); setError('');
    try {
      const result = await dutyRequest<SelfRegistrationWeek>('/api/auth/attendance/shift-registration', 'PUT', { week, days: changed.map(date => ({ work_date: date, shift_code: draft[date] || null, revision: data.registrations.find(row => row.work_date === date)?.revision ?? null })) });
      if (result.week !== week || result.staff?.id !== data.staff.id || !Array.isArray(result.registrations)) throw new Error('Chưa xác nhận được ca đã lưu. Tải lại để kiểm tra.');
      apply(result); onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không lưu được đăng ký.');
      if (!(cause instanceof DutyRequestError) || cause.status === 0 || cause.status === 409 || cause.status >= 500) setUncertain(true);
    } finally { lock.current = false; setSaving(false); }
  }
  return <Dialog title="Đăng ký ca làm trong tuần" subtitle={data ? `${data.staff.name} · ${data.staff.store_name}` : 'Chọn ca làm việc của bạn từ thứ Hai đến Chủ nhật'} onClose={() => { if (!lock.current) onClose(); }}>
    <div className="mg-dialog-body">
      <div className={styles.navigation}>
        <button type="button" className="mg-button" aria-label="Tuần trước" disabled={saving || loading || changed.length > 0 || week <= weekStart(data?.today || vietnamDate())} onClick={() => setWeek(addDays(week, -7))}><ChevronLeft size={16} /></button>
        <strong><CalendarDays size={16} />{dateLabel(week)} – {dateLabel(addDays(week, 6))}/{addDays(week, 6).slice(0, 4)}</strong>
        <button type="button" className="mg-button" aria-label="Tuần sau" disabled={saving || loading || changed.length > 0 || addDays(week, 7) > '2100-12-25'} onClick={() => setWeek(addDays(week, 7))}><ChevronRight size={16} /></button>
      </div>
      {loading && <p role="status">Đang tải đăng ký ca của bạn…</p>}
      {error && <p className="mg-field-error" role="alert">{error} <button type="button" className="mg-button" disabled={saving} onClick={() => setReload(value => value + 1)}>Tải lại để kiểm tra</button></p>}
      {data && <><div className={styles.days}>{data.dates.map(date => {
        const past = date < data.today;
        return <div key={date} className={`${styles.day} ${past ? styles.past : ''} ${date === data.today ? styles.today : ''}`}>
          <span><strong>{new Date(`${date}T00:00:00Z`).toLocaleDateString('vi-VN', { timeZone: 'UTC', weekday: 'long' })}</strong><small>{dateLabel(date)}{date === data.today ? ' · Hôm nay' : past ? ' · Đã qua' : ''}</small></span>
          <ShiftSearchPicker label={`Ca làm ngày ${dateLabel(date)}`} disabled={unavailable || past} value={draft[date] || ''} open={activeDate === date} onOpenChange={open => setActiveDate(open ? date : null)} onChange={code => setDraft(current => ({ ...current, [date]: code }))} />
        </div>;
      })}</div>
      <div className={styles.summary}><span>Tổng công đăng ký dự kiến</span><strong>{shiftCreditLabel(data.dates.reduce((sum, date) => sum + registrationCredit(draft[date]), 0))} công</strong></div>
      <p className="mg-reminder-help">Chỉ đăng ký ca của chính bạn tại cơ sở trong hồ sơ. Ngày đã qua không thể sửa. Ca đăng ký được hiển thị trên bảng tháng của quản lý, chưa thay thế lịch trực và công chấm thực tế.</p>
      {changed.length > 0 && <p className="mg-reminder-help">Có {changed.length} ngày thay đổi. Lưu hoặc bỏ thay đổi trước khi chuyển tuần. <button type="button" className="mg-button" disabled={saving} onClick={() => apply(data)}>Bỏ thay đổi</button></p>}</>}
    </div>
    <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Đóng</button><button type="button" className="mg-button mg-button-primary" disabled={unavailable || !changed.length} onClick={() => void save()}>{saving ? 'Đang lưu đăng ký…' : 'Lưu đăng ký ca'}</button></div>
  </Dialog>;
}
