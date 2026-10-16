'use client';

import { ReactNode, useRef } from 'react';
import { Eye } from 'lucide-react';
import { RowAction, RowActionsMenu } from './RowActionsMenu';

interface Props {
  title: string;
  summary: ReactNode;
  fields: readonly (readonly [string, ReactNode])[];
  preview?: ReactNode;
  actions?: RowAction[];
  selection?: { label: string; checked: boolean; onChange: (checked: boolean) => void };
}

export function MobileDetailsCard({ title, summary, fields, preview, actions = [], selection }: Props) {
  const detail = useRef<HTMLDetailsElement>(null);
  return <li className={`mg-mobile-record-card${selection?.checked ? ' is-selected' : ''}`}>
    {selection && <label className="mg-mobile-card-select"><input type="checkbox" aria-label={selection.label} checked={selection.checked} onChange={event => selection.onChange(event.target.checked)} /></label>}
    <details ref={detail} className="mg-mobile-card-detail">
      <summary className="mg-mobile-card-main"><span className="mg-mobile-card-title">{title}</span><span className="mg-mobile-card-summary">{summary}</span>{preview&&<span className="mg-transfer-direction">{preview}</span>}</summary>
      <dl className="mg-mobile-detail-fields">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </details>
    <div className="mg-mobile-card-actions"><RowActionsMenu label={`Thao tác ${title}`} actions={[
      { key: 'view', label: 'Xem chi tiết', icon: <Eye size={16} />, onSelect: () => { if (detail.current) { detail.current.open = true; detail.current.querySelector('summary')?.focus(); } } },
      ...actions,
    ]} /></div>
  </li>;
}
