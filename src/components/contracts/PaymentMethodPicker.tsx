'use client';

import { useEffect, useRef, useState } from 'react';

const METHODS = ['Tiền mặt', 'CK tk cá nhân', 'CK tk công ty'];
export function PaymentMethodPicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLDetailsElement>(null), [open,setOpen] = useState(false);
  const chosen = value.split(',').map(item=>item.trim()).filter(Boolean);
  useEffect(()=>{
    if (!open) return;
    const closeOutside = (event: Event) => { if (ref.current && !ref.current.contains(event.target as Node)) ref.current.open = false; };
    document.addEventListener('pointerdown',closeOutside,true); document.addEventListener('focusin',closeOutside);
    return ()=>{ document.removeEventListener('pointerdown',closeOutside,true); document.removeEventListener('focusin',closeOutside); };
  },[open]);
  return <details ref={ref} className="mg-method-picker" onToggle={event=>setOpen(event.currentTarget.open)}
    onKeyDown={event=>{ if(event.key==='Escape' && ref.current?.open){event.preventDefault();event.stopPropagation();ref.current.open=false;ref.current.querySelector('summary')?.focus();} }}>
    <summary aria-label={label}>{chosen.length ? chosen.join(', ') : 'Chọn một hoặc nhiều hình thức'}</summary>
    <div className="mg-method-picker-options">{METHODS.map(method=><label key={method}><input type="checkbox" checked={chosen.includes(method)}
      onChange={event=>onChange((event.target.checked ? [...chosen,method] : chosen.filter(item=>item!==method)).join(', '))} />{method}</label>)}</div>
  </details>;
}
