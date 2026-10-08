'use client';

import { ReactNode, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export function trapFocusWithin(container: HTMLElement) {
  const keydown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const elements = Array.from(container.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')).filter(element => element.getClientRects().length > 0);
    const first = elements[0], last = elements[elements.length - 1];
    if (!first) { event.preventDefault(); container.focus(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  container.addEventListener('keydown', keydown);
  return () => container.removeEventListener('keydown', keydown);
}

export function Dialog({ title, subtitle, children, onClose, className = '' }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    if (!dialog?.open) dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const releaseFocus = dialog ? trapFocusWithin(dialog) : () => {};
    const keepFocusVisible = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      if (!dialog || !target.closest('.mg-dialog-body') || target.tagName === 'SELECT') return;
      dialog.style.scrollPaddingTop = `${(dialog.querySelector('.mg-dialog-header')?.getBoundingClientRect().height || 0) + 12}px`;
      dialog.style.scrollPaddingBottom = `${(dialog.querySelector('.mg-dialog-footer')?.getBoundingClientRect().height || 0) + 12}px`;
      requestAnimationFrame(() => { if (dialog.open && target === document.activeElement) target.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
    };
    dialog?.addEventListener('focusin', keepFocusVisible);
    return () => { releaseFocus(); dialog?.removeEventListener('focusin', keepFocusVisible); dialog?.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);
  return <dialog ref={ref} className={`mg-dialog ${className}`} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <div className="mg-dialog-header"><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      <button className="mg-icon-button" type="button" onClick={onClose} aria-label="Đóng hộp thoại"><X size={20} /></button></div>
    {children}
  </dialog>;
}
