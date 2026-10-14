'use client';
import { ReactNode, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
export function ResponsiveDataActions({children}:{children:ReactNode}) {
  const [open,setOpen] = useState(false);
  useEffect(()=>{const media=window.matchMedia('(max-width: 767px)');const update=()=>setOpen(!media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  return <details className="mg-data-actions" open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary className="mg-button">Quản lý dữ liệu<ChevronDown size={16}/></summary><div>{children}</div></details>;
}
