'use client';

import { useId, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

const searchKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
interface Props { id: string; value: string; suggestions: string[]; onChange: (value: string) => void; disabled?: boolean; placeholder?: string; dismissalKey?: string; searchAliases?: Record<string, string[]> }

/** Free text with app-owned suggestions. Removing a suggestion never edits its source record. */
export function SuggestionInput({ id, value, suggestions, onChange, disabled, placeholder, dismissalKey, searchAliases }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [hidden, setHidden] = useState<string[]>(() => {
    try { const stored = dismissalKey ? JSON.parse(localStorage.getItem(dismissalKey) || '[]') : []; return Array.isArray(stored) ? stored.filter(item => typeof item === 'string') : []; }
    catch { return []; }
  });
  const options = [...new Set(suggestions)].filter(option => option && !hidden.includes(option) && [option, ...(searchAliases?.[option] || [])].some(label => searchKey(label).includes(searchKey(value))));
  function pick(option: string) { onChange(option); setOpen(false); setActive(-1); }
  function remove(option: string) {
    const next = [...hidden, option]; setHidden(next); setActive(-1);
    try { if (dismissalKey) localStorage.setItem(dismissalKey, JSON.stringify(next)); } catch { /* The current popup still removes the suggestion when storage is unavailable. */ }
  }
  return <div className="mg-suggestion" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) { setOpen(false); setActive(-1); } }}>
    <div className="mg-suggestion-control"><input id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
      aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined} autoComplete="off" maxLength={191} value={value} disabled={disabled} placeholder={placeholder}
      onFocus={() => setOpen(true)} onChange={event => { onChange(event.target.value); setOpen(true); setActive(-1); }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(current => !options.length ? -1 : current < 0 ? event.key === 'ArrowDown' ? 0 : options.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length); }
        else if (event.key === 'Enter' && open && options[active]) { event.preventDefault(); pick(options[active]); }
        else if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); setActive(-1); }
      }} />
      <button type="button" disabled={disabled} aria-label={`Gợi ý ${id === 'staff-position' ? 'chức vụ' : 'chủ tài khoản'}`} aria-expanded={open}
        onClick={() => { setOpen(current => !current); setActive(-1); }}><ChevronDown size={16} aria-hidden="true" /></button></div>
    {open && !disabled && <div className="mg-suggestion-popup">
      <div id={listId} role="listbox" aria-label="Gợi ý">{options.map((option, index) => <div className={`mg-suggestion-row${active === index ? ' is-active' : ''}`} key={option}>
        <button type="button" role="option" id={`${listId}-${index}`} aria-selected={active === index} onMouseDown={event => event.preventDefault()} onClick={() => pick(option)}>{option}</button>
        {dismissalKey && <button type="button" className="mg-suggestion-remove" aria-label={`Xóa gợi ý ${option}`} title="Xóa gợi ý trên trình duyệt này" onClick={() => remove(option)}><X size={14} aria-hidden="true" /></button>}
      </div>)}</div>
      {!options.length && <small>Gõ giá trị mới để sử dụng.</small>}
    </div>}
  </div>;
}
