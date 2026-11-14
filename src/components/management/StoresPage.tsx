'use client';

import { useState } from 'react';
import { ContractSectionTabs } from '@/components/contracts/ContractSectionTabs';
import { ManagementPage } from './ManagementPage';
import { StoreWorkShifts } from './StoreWorkShifts';

const SECTIONS = [{ id: 'stores', label: 'Cơ sở' }, { id: 'shifts', label: 'Ca làm việc' }] as const;

export function StoresPage() {
  const [section, setSection] = useState<'stores' | 'shifts'>('stores');
  return <>
    <ContractSectionTabs prefix="stores-work" label="Quản lý cơ sở" sections={SECTIONS} active={section} onChange={setSection} />
    <section id="stores-work-panel-stores" role="tabpanel" aria-labelledby="stores-work-tab-stores" hidden={section !== 'stores'}><ManagementPage kind="stores" /></section>
    <section id="stores-work-panel-shifts" role="tabpanel" aria-labelledby="stores-work-tab-shifts" hidden={section !== 'shifts'} className="mg-card"><StoreWorkShifts /></section>
  </>;
}
