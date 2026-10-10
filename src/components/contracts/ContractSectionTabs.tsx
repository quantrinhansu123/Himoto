'use client';

import { useRef } from 'react';

export const CONTRACT_FORM_SECTIONS = [
  { id: 'contract', label: 'Hợp đồng & pháp lý' },
  { id: 'customer', label: 'Khách hàng' },
  { id: 'vehicle', label: 'Phương tiện' },
  { id: 'payment', label: 'Chi phí' },
  { id: 'signing', label: 'Ký kết & ghi chú' },
] as const;
export type ContractSection = (typeof CONTRACT_FORM_SECTIONS)[number]['id'];

export function ContractSectionTabs<T extends string = ContractSection>({ prefix, sections = CONTRACT_FORM_SECTIONS as unknown as readonly { id: T; label: string }[], active, onChange }: {
  prefix: string;
  sections?: readonly { id: T; label: string }[];
  active: T;
  onChange: (section: T) => void;
}) {
  const tabs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({});
  return <div className="mg-contract-tabs" role="tablist" aria-label="Các phần của hợp đồng">
    {sections.map((section, index) => <button key={section.id} ref={element => { tabs.current[section.id] = element; }}
      id={`${prefix}-tab-${section.id}`} type="button" role="tab" aria-selected={active === section.id}
      aria-controls={`${prefix}-panel-${section.id}`} tabIndex={active === section.id ? 0 : -1}
      onClick={() => onChange(section.id)} onKeyDown={event => {
        let next: number;
        if (event.key === 'ArrowRight') next = (index + 1) % sections.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + sections.length) % sections.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = sections.length - 1;
        else return;
        event.preventDefault();
        onChange(sections[next].id);
        tabs.current[sections[next].id]?.focus();
      }}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{section.label}</button>)}
  </div>;
}
