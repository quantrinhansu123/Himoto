'use client';

import { vietnamRentalTime } from '@/lib/management/rental-time';

/** Explicit 00–23 hour choices do not depend on browser SA/CH or AM/PM preferences. */
export function DateTime24Controls({ id, label, value, onChange, error, describedBy }: {
  id: string; label: string; value: string; onChange: (value: string) => void; error?: boolean; describedBy?: string;
}) {
  const date = value.slice(0, 10), hour = value.slice(11, 13), minute = value.slice(14, 16);
  const setTime = (nextHour: string, nextMinute: string) => onChange(`${date || vietnamRentalTime().slice(0, 10)}T${nextHour || '00'}:${nextMinute || '00'}`);
  return <div className="mg-datetime24">
    <input id={id} type="date" value={date} aria-invalid={error || undefined} aria-describedby={describedBy}
      onChange={event => onChange(event.target.value ? `${event.target.value}T${hour || '00'}:${minute || '00'}` : '')} />
    <div className="mg-time24">
      <select aria-label={`Giờ ${label.toLowerCase()} (24h)`} value={hour} onChange={event => setTime(event.target.value, minute)}>
        <option value="">--</option>{Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0')).map(item => <option key={item} value={item}>{item}</option>)}
      </select>
      <span aria-hidden="true">:</span>
      <select aria-label={`Phút ${label.toLowerCase()}`} value={minute} onChange={event => setTime(hour, event.target.value)}>
        <option value="">--</option>{Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0')).map(item => <option key={item} value={item}>{item}</option>)}
      </select>
    </div>
  </div>;
}

export function DateTime24Field({ id, label, value, onChange, error, required = true, hint = true }: {
  id: string; label: string; value: string; onChange: (value: string) => void; error?: string; required?: boolean; hint?: boolean;
}) {
  return <div className="mg-field"><label htmlFor={id}>{label}{required ? ' *' : ''}</label>
    <DateTime24Controls id={id} label={label} value={value} onChange={onChange} error={Boolean(error)} describedBy={error ? `${id}-error` : undefined} />
    {hint && <small>Giờ 24h, ví dụ 15:30.</small>}
    {error && <p id={`${id}-error`} className="mg-field-error">{error}</p>}
  </div>;
}
