'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

const searchKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();

export type FilterOption = { value: string; label: string };

/** Searchable single-select for list filter bars. Value is option.value; empty string clears. */
export function FilterCombobox({
  id, label, value, options, emptyLabel, onChange,
}: {
  id: string; label: string; value: string; options: FilterOption[]; emptyLabel: string; onChange: (value: string) => void;
}) {
  const listId = useId();
  const selected = options.find(option => option.value === value);
  const display = value ? (selected?.label || value) : '';
  const [text, setText] = useState(display);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => { setText(display); }, [display]);

  const matches = useMemo(() => {
    const needle = searchKey(text);
    const pool = [{ value: '', label: emptyLabel }, ...options];
    if (!needle || text === display) return pool;
    return pool.filter(option => searchKey(option.label).includes(needle) || searchKey(option.value).includes(needle));
  }, [text, display, options, emptyLabel]);

  function pick(option: FilterOption | { value: ''; label: string }) {
    onChange(option.value);
    setText(option.value ? option.label : '');
    setOpen(false);
    setActive(-1);
  }

  function clear() {
    onChange('');
    setText('');
    setOpen(false);
    setActive(-1);
  }

  return (
    <label className="mg-sr-label mg-filter-combobox">
      <span className="mg-sr-only">{label}</span>
      <div
        className="mg-suggestion"
        onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setOpen(false);
            setActive(-1);
            setText(display);
          }
        }}
      >
        <div className="mg-suggestion-control">
          <input
            id={id}
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
            autoComplete="off"
            placeholder={emptyLabel}
            value={text}
            onFocus={() => setOpen(true)}
            onChange={event => { setText(event.target.value); setOpen(true); setActive(-1); }}
            onKeyDown={event => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setOpen(true);
                setActive(current => !matches.length ? -1
                  : current < 0 ? (event.key === 'ArrowDown' ? 0 : matches.length - 1)
                    : (current + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
              } else if (event.key === 'Enter' && open && matches[active]) {
                event.preventDefault();
                pick(matches[active]);
              } else if (event.key === 'Escape' && open) {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                setActive(-1);
                setText(display);
              }
            }}
          />
          {value ? (
            <button type="button" className="mg-filter-combobox-clear" aria-label={`Xóa ${label}`} onClick={clear}>
              <X size={14} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" aria-label={`Gợi ý ${label}`} aria-expanded={open} onClick={() => { setOpen(current => !current); setActive(-1); }}>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        {open && (
          <div className="mg-suggestion-popup">
            <div id={listId} role="listbox" aria-label={label}>
              {matches.map((option, index) => (
                <div className={`mg-suggestion-row${active === index ? ' is-active' : ''}`} key={`${option.value || 'all'}-${option.label}`}>
                  <button
                    type="button"
                    role="option"
                    id={`${listId}-${index}`}
                    aria-selected={active === index || option.value === value}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => pick(option)}
                  >
                    {option.label}
                  </button>
                </div>
              ))}
              {!matches.length && <small>Không có lựa chọn khớp. Gõ thêm hoặc xóa để xem lại.</small>}
            </div>
          </div>
        )}
      </div>
    </label>
  );
}
