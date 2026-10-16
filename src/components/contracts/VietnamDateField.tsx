'use client';

import { Fragment, useId, useRef } from 'react';
import { CalendarDays } from 'lucide-react';
import { validIdentityIssueDate } from '@/lib/management/customer-identity';

type DateParts = [string, string, string];
const segments = [
  { key: 'day', label: 'ngày', placeholder: 'dd', length: 2 },
  { key: 'month', label: 'tháng', placeholder: 'mm', length: 2 },
  { key: 'year', label: 'năm', placeholder: 'yyyy', length: 4 },
] as const;

function dateParts(value: string): DateParts {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return [iso[3], iso[2], iso[1]];
  const [day = '', month = '', year = ''] = value.split('/');
  return [day, month, year];
}

// Incomplete/invalid input stays in the form so existing validation can report it.
function dateValue([day, month, year]: DateParts) {
  if (!day && !month && !year) return '';
  if (day.length === 2 && month.length === 2 && year.length === 4) return `${year}-${month}-${day}`;
  return `${day}/${month}/${year}`;
}

export function VietnamDateField({ id, label, value, onChange, disabled, readOnly, invalid, describedBy }: {
  id: string; label: string; value: string; onChange: (iso: string) => void;
  disabled?: boolean; readOnly?: boolean; invalid?: boolean; describedBy?: string;
}) {
  const pickerId = useId();
  const pickerRef = useRef<HTMLInputElement>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const parts = dateParts(value);
  const partsRef = useRef(parts); partsRef.current = parts;

  function commit(next: DateParts) {
    partsRef.current = next;
    onChange(dateValue(next));
  }

  function focus(index: number) {
    inputs.current[index]?.focus();
    inputs.current[index]?.select();
  }

  function update(index: number, text: string) {
    const next: DateParts = [...partsRef.current];
    next[index] = text.replace(/\D/g, '').slice(0, segments[index].length);
    commit(next);
    if (next[index].length === segments[index].length && index < 2) focus(index + 1);
  }

  return <div className="mg-vietnam-date" role="group" aria-label={label} data-invalid={invalid || undefined} data-disabled={disabled || undefined}>
    {segments.map((segment, index) => <Fragment key={segment.key}>
      {index > 0 && <span className="mg-vietnam-date-divider" aria-hidden="true">/</span>}
      <input ref={input => { inputs.current[index] = input; }} id={index === 0 ? id : `${id}-${segment.key}`}
        className={`mg-vietnam-date-segment mg-vietnam-date-${segment.key}`} type="text" inputMode="numeric"
        autoComplete="off" placeholder={segment.placeholder} maxLength={segment.length} enterKeyHint={index < 2 ? 'next' : 'done'}
        aria-label={`${label} — ${segment.label} (${segment.placeholder})`} aria-invalid={invalid || undefined} aria-describedby={describedBy}
        value={parts[index]} disabled={disabled} readOnly={readOnly}
        onFocus={event => event.currentTarget.select()}
        onClick={event => event.currentTarget.select()}
        onMouseUp={event => event.preventDefault()}
        onChange={event => { if (!readOnly) update(index, event.target.value); }}
        onBlur={() => {
          if (!readOnly && index < 2 && partsRef.current[index].length === 1) {
            const next: DateParts = [...partsRef.current]; next[index] = next[index].padStart(2, '0');
            commit(next);
          }
        }}
        onPaste={event => {
          if (readOnly) return;
          const text = event.clipboardData.getData('text').trim();
          const display = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
          let next: DateParts;
          if (/^\d{4}-\d{2}-\d{2}$/.test(text)) next = dateParts(text);
          else if (display) next = [display[1].padStart(2, '0'), display[2].padStart(2, '0'), display[3]];
          else if (/^\d{8}$/.test(text)) next = [text.slice(0, 2), text.slice(2, 4), text.slice(4)];
          else return;
          event.preventDefault(); commit(next); focus(2);
        }}
        onKeyDown={event => {
          const input = event.currentTarget;
          const collapsed = input.selectionStart === input.selectionEnd;
          if (['/', '.', '-'].includes(event.key)) {
            event.preventDefault();
            if (input.value && index < 2) focus(index + 1);
          } else if (index > 0 && (event.key === 'Backspace' && !input.value || event.key === 'ArrowLeft' && collapsed && input.selectionStart === 0)) {
            event.preventDefault(); focus(index - 1);
          } else if (index < 2 && (event.key === 'Enter' || event.key === 'ArrowRight' && collapsed && input.selectionStart === input.value.length)) {
            event.preventDefault(); focus(index + 1);
          }
        }} />
    </Fragment>)}
    <input ref={pickerRef} id={pickerId} className="mg-vietnam-date-native" type="date" tabIndex={-1} aria-hidden="true"
      value={value && validIdentityIssueDate(value) ? value : ''} disabled={disabled || readOnly}
      onChange={event => onChange(event.target.value)} />
    <button type="button" className="mg-vietnam-date-picker" disabled={disabled || readOnly}
      aria-label={`Chọn ${label.toLowerCase()} trên lịch`} title="Chọn ngày"
      onClick={() => {
        const input = pickerRef.current;
        if (!input) return;
        try { input.showPicker(); } catch { input.focus(); input.click(); }
      }}>
      <CalendarDays size={16} aria-hidden="true" />
    </button>
  </div>;
}
