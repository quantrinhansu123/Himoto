'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';

/** Internal storage stays YYYY-MM-DD; the visible field is typed/picked as dd/mm/yyyy. */
function toDisplay(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function toIso(display: string): string | null {
  const digits = display.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length !== 8) return null;
  const day = digits.slice(0, 2), month = digits.slice(2, 4), year = digits.slice(4, 8);
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

function maskTyping(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function VietnamDateField({ id, value, onChange, disabled, readOnly, invalid, describedBy, placeholder = 'dd/mm/yyyy' }: {
  id: string; value: string; onChange: (iso: string) => void;
  disabled?: boolean; readOnly?: boolean; invalid?: boolean; describedBy?: string; placeholder?: string;
}) {
  const pickerId = useId();
  const pickerRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => toDisplay(value));

  useEffect(() => {
    setText(current => {
      const next = toDisplay(value);
      if (!value) return current && toIso(current) === null ? current : '';
      return next;
    });
  }, [value]);

  function commit(raw: string) {
    const masked = maskTyping(raw);
    setText(masked);
    const iso = toIso(masked);
    if (iso === null) return;
    if (iso !== value) onChange(iso);
  }

  function blur() {
    const iso = toIso(text);
    if (iso === null) {
      if (!text.trim()) { if (value) onChange(''); return; }
      setText(toDisplay(value));
      return;
    }
    setText(toDisplay(iso));
    if (iso !== value) onChange(iso);
  }

  return <div className="mg-vietnam-date">
    <input id={id} type="text" inputMode="numeric" autoComplete="off" placeholder={placeholder}
      value={text} disabled={disabled} readOnly={readOnly} aria-invalid={invalid || undefined}
      aria-describedby={describedBy} maxLength={10}
      onChange={event => { if (!readOnly) commit(event.target.value); }}
      onBlur={blur} />
    <input ref={pickerRef} id={pickerId} className="mg-vietnam-date-native" type="date" tabIndex={-1} aria-hidden="true"
      value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''} disabled={disabled || readOnly}
      onChange={event => {
        const next = event.target.value;
        setText(toDisplay(next));
        onChange(next);
      }} />
    <button type="button" className="mg-vietnam-date-picker" disabled={disabled || readOnly}
      aria-label="Chọn ngày trên lịch" title="Chọn ngày"
      onClick={() => {
        const input = pickerRef.current;
        if (!input) return;
        try { input.showPicker(); } catch { input.focus(); input.click(); }
      }}>
      <CalendarDays size={16} aria-hidden="true" />
    </button>
  </div>;
}
