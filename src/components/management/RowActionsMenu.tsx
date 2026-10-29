'use client';

import { KeyboardEvent as ReactKeyboardEvent, ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle, MoreHorizontal } from 'lucide-react';

export interface RowAction {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
}

interface MenuPosition { top?: number; bottom?: number; right: number }

const MENU_ESTIMATED_HEIGHT = 320;

export function RowActionsMenu({ label, actions, busy, triggerLabel, disabled }: { label: string; actions: RowAction[]; busy?: boolean; triggerLabel?: ReactNode; disabled?: boolean }) {
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const open = position !== null;

  const close = useCallback((restoreFocus = false) => {
    setPosition(null);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  const toggle = () => {
    if (open) return close();
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const right = Math.max(8, window.innerWidth - rect.right);
    const openUp = rect.bottom + MENU_ESTIMATED_HEIGHT > window.innerHeight && rect.top > window.innerHeight - rect.bottom;
    setPosition(openUp ? { bottom: window.innerHeight - rect.top + 4, right } : { top: rect.bottom + 4, right });
  };

  useEffect(() => {
    if (!open) return;
    const anchor = triggerRef.current?.getBoundingClientRect();
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close();
    };
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      const rect = triggerRef.current?.getBoundingClientRect();
      // A queued scroll event from bringing the trigger into view must not close a new menu.
      if (!rect || !anchor || Math.abs(rect.top - anchor.top) > 1 || Math.abs(rect.right - anchor.right) > 1) close();
    };
    const onResize = () => close();
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, close]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      close(true);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : event.key === 'ArrowDown' ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
    items[next].focus({ preventScroll: true });
    items[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return <>
    <button ref={triggerRef} type="button" className={`${triggerLabel ? 'mg-button mg-row-menu-trigger-text' : 'mg-icon-button'} mg-row-menu-trigger${open ? ' is-open' : ''}`} aria-label={triggerLabel ? undefined : label} title={triggerLabel ? undefined : 'Thao tác'}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} disabled={disabled} onClick={toggle}>
      {busy ? <LoaderCircle size={16} className="mg-spin" /> : triggerLabel || <MoreHorizontal size={18} />}
    </button>
    {open && createPortal(<div ref={menuRef} id={menuId} role="menu" aria-label={label} className="mg-row-menu"
      style={{ ...position, maxHeight: `calc(100dvh - ${position.top ?? position.bottom ?? 0}px - 12px)` }} onKeyDown={onMenuKeyDown}>
      {actions.map(action => <button key={action.key} type="button" role="menuitem" className={action.danger ? 'is-danger' : undefined}
        disabled={action.disabled} title={action.title} aria-label={action.disabled && action.title ? `${action.label}. ${action.title}` : undefined}
        onClick={() => { if (action.disabled) return; close(true); action.onSelect(); }}>
        {action.icon}<span className="mg-row-action-copy"><span>{action.label}</span>{action.disabled && action.title ? <small>{action.title}</small> : null}</span>
      </button>)}
    </div>, triggerRef.current?.closest('dialog') || document.body)}
  </>;
}
