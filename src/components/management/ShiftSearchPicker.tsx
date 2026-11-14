'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Clock3, Search, X } from 'lucide-react';
import { SHIFT_SEARCH_OPTIONS, searchRegistrationShifts } from '@/lib/management/shift-search';
import { shiftCreditLabel } from '@/lib/management/attendance-shifts';
import styles from './ShiftSearchPicker.module.css';

interface Props {
  value: string; label: string; disabled?: boolean; open: boolean;
  onOpenChange: (open: boolean) => void; onChange: (value: string) => void;
}
export function ShiftSearchPicker({ value, label, disabled, open, onOpenChange, onChange }: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState('');
  const selected = SHIFT_SEARCH_OPTIONS.find(shift => shift.code === value) || SHIFT_SEARCH_OPTIONS[0];
  const options = searchRegistrationShifts(query);
  useEffect(() => {
    if (!open || disabled) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) onOpenChange(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, disabled, onOpenChange]);
  function pick(code: string) {
    onChange(code); onOpenChange(false); setQuery(''); trigger.current?.focus();
  }
  return <div ref={root} className={styles.root} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); onOpenChange(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} type="button" aria-label={`${label}: ${value ? `${selected.code} · ${selected.name} · ${selected.hours}` : 'Chưa đăng ký'}`} aria-expanded={open && !disabled} aria-controls={id} disabled={disabled}
      className={`${styles.trigger} ${value === 'O' ? styles.off : value === 'F' ? styles.full : ''}`} onClick={() => { setQuery(''); onOpenChange(!open); }}>
      <span className={styles.code}>{value || <Search size={17} aria-hidden="true" />}</span>
      <span className={styles.selection}><strong>{selected.name}</strong><small>{value ? selected.hours : 'Bấm chọn hoặc gõ tìm ca'}</small></span>
      <ChevronDown size={18} aria-hidden="true" className={open ? styles.expanded : ''} />
    </button>
    {open && !disabled && <section id={id} className={styles.panel} aria-label={`Chọn ${label.toLowerCase()}`}>
      <div className={styles.search}>
        <Search size={18} aria-hidden="true" />
        <input type="search" aria-label={`Tìm ${label.toLowerCase()}`} placeholder="Gõ mã ca, tên ca hoặc giờ làm…" autoComplete="off" spellCheck={false} value={query} onChange={event => setQuery(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (options.length === 1) pick(options[0].code); } }} />
        {query && <button type="button" aria-label="Xóa từ khóa tìm ca" onClick={() => { setQuery(''); root.current?.querySelector('input')?.focus(); }}><X size={16} aria-hidden="true" /></button>}
      </div>
      <p className={styles.hint} role="status">{query ? `${options.length} ca phù hợp` : 'Ví dụ: G1, sáng, tối, 8h hoặc 17:00'}</p>
      <div className={styles.options} role="group" aria-label="Các ca làm phù hợp">{options.map(option => <button type="button" key={option.code} aria-pressed={option.code === value} className={`${styles.option} ${option.code === value ? styles.selected : ''}`} onClick={() => pick(option.code)}>
        <span className={`${styles.badge} ${option.code === 'O' ? styles.off : option.code === 'F' ? styles.full : ''}`}>{option.code || '—'}</span>
        <span className={styles.optionText}><strong>{option.name}</strong><small><Clock3 size={12} aria-hidden="true" />{option.hours}</small></span>
        <span className={styles.credit}>{option.credit == null ? '' : `${shiftCreditLabel(option.credit)} công`}{option.code === value && <Check size={17} aria-label="Đang chọn" />}</span>
      </button>)}</div>
      {!options.length && <p className={styles.empty}>Không tìm thấy ca. Thử “sáng”, “chiều”, “tối” hoặc mã S, G1, G2…</p>}
    </section>}
  </div>;
}
