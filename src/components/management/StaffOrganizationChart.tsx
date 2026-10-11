'use client';

import { useState } from 'react';
import { Building2, Eye, Network, Pencil, Phone, RotateCcw, Trash2, Users } from 'lucide-react';
import { ManagementRow } from '@/lib/management/types';
import { useManagement } from './ManagementProvider';
import { StaffDialog, StaffDialogMode } from './StaffDialogs';
import { branchStaffPosition, normalizeStaffPosition, STAFF_DEPARTMENTS, staffRoles } from '@/lib/management/staff-positions';

function staffGroups(staff: ManagementRow[], branch = false) {
  const groups = new Map<string, ManagementRow[]>();
  for (const person of staff) {
    const position = (branch ? branchStaffPosition(person.position) : normalizeStaffPosition(person.position)) || 'Chưa có chức vụ';
    groups.set(position, [...(groups.get(position) || []), person]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b, 'vi'));
}
const initials = (name: string) => name.trim().split(/\s+/).slice(-2).map(part => part[0] || '').join('').toUpperCase() || '?';
const INACTIVE_LABEL: Record<string, string> = { inactive: 'Tạm nghỉ', leave: 'Đã nghỉ việc' };

interface PersonProps { person: ManagementRow; position?: string; onAction: (person: ManagementRow, mode: StaffDialogMode) => void }
function PersonCard({ person, position = normalizeStaffPosition(person.position), onAction }: PersonProps) {
  const name = person.name || '—', inactive = INACTIVE_LABEL[person.status];
  return <div className={`mg-org-person${inactive ? ' is-inactive' : ''}`}>
    <span className="mg-org-avatar" aria-hidden="true">{initials(name)}</span>
    <div className="mg-org-person-info"><strong title={name}>{name}</strong>
      <span className="mg-org-role" title={`${position || 'Chưa có chức vụ'} · ${person.store_name || 'Trụ sở công ty'}`}><b>{position || 'Chưa có chức vụ'}</b><i>{person.store_name || 'Trụ sở công ty'}</i></span>
      <span className="mg-org-phone">{person.phone ? <a href={`tel:${person.phone}`}><Phone size={11} />{person.phone}</a> : '—'}</span>
      {inactive && <em className="mg-org-badge">{inactive}</em>}</div>
    <div className="mg-org-actions" role="group" aria-label={`Thao tác với ${name}`}>
      <button type="button" className="mg-icon-button" title="Xem" aria-label={`Xem ${name}`} onClick={() => onAction(person, 'view')}><Eye size={15} /></button>
      <button type="button" className="mg-icon-button" title="Sửa" aria-label={`Sửa ${name}`} onClick={() => onAction(person, 'edit')}><Pencil size={15} /></button>
      <button type="button" className="mg-icon-button is-danger" title="Xóa" aria-label={`Xóa ${name}`} onClick={() => onAction(person, 'delete')}><Trash2 size={15} /></button>
    </div>
  </div>;
}

function Groups({ people, onAction }: { people: ManagementRow[]; onAction: PersonProps['onAction'] }) {
  return <>{staffGroups(people, true).map(([position, members]) => <section className="mg-org-group" key={position}>
    <h4>{position}<span>{members.length}</span></h4><div className="mg-org-people">{members.map(person => <PersonCard key={person.id} person={person} position={position} onAction={onAction} />)}</div></section>)}</>;
}

export function StaffOrganizationChart() {
  const { dataset, selectedStore, reload, loading, refreshing, error } = useManagement();
  const [target, setTarget] = useState<{ person: ManagementRow; mode: StaffDialogMode } | null>(null);
  const [showDeparted, setShowDeparted] = useState(false);
  const allStores = dataset?.stores || [];
  const staff = (dataset?.staff || []).filter(person => showDeparted || person.status !== 'leave');
  const stores = allStores.filter(store => selectedStore === 'all' || String(store.id) === selectedStore);
  const departments = selectedStore === 'all' ? STAFF_DEPARTMENTS.map(department => ({ ...department,
    people: staff.filter(person => staffRoles(person.position).includes(department.role) && (department.role !== 'NVKD' || !person.store_id)),
  })).filter(department => department.people.length) : [];
  const unassigned = selectedStore === 'all' ? staff.filter(person => !allStores.some(store => store.id === person.store_id) && !departments.some(department => department.people.includes(person))) : [];
  const shown = staff.filter(person => unassigned.includes(person) || departments.some(department => department.people.includes(person)) || stores.some(store => store.id === person.store_id));
  const working = shown.filter(person => !INACTIVE_LABEL[person.status]).length;
  const onAction: PersonProps['onAction'] = (person, mode) => setTarget({ person, mode });
  return <section className="mg-org-section" aria-labelledby="staff-org-title">
    <div className="mg-org-heading"><div><span className="mg-eyebrow">CƠ CẤU TỔ CHỨC</span><h2 id="staff-org-title">Sơ đồ nhân sự</h2><p>Nhân sự và cơ sở theo dữ liệu hiện tại trên hệ thống. Xem, sửa hoặc xóa trực tiếp trên từng thẻ nhân sự.</p></div>
      <div className="mg-org-heading-actions"><label><input type="checkbox" checked={showDeparted} onChange={event => setShowDeparted(event.target.checked)} />Hiện nhân sự đã nghỉ việc</label><button type="button" className="mg-button" disabled={loading || refreshing} onClick={() => void reload()}><RotateCcw size={16} className={refreshing ? 'mg-spin' : undefined} />{refreshing ? 'Đang tải…' : 'Làm mới'}</button></div></div>
    {loading ? <p role="status">Đang tải sơ đồ nhân sự…</p> : error ? <p role="alert">Không tải được sơ đồ nhân sự. Vui lòng thử lại.</p> : <div className="mg-org-scroll" tabIndex={0} role="region" aria-label="Sơ đồ nhân sự">
      <div className="mg-org-chart">
        <div className="mg-org-root"><span className="mg-org-root-icon" aria-hidden="true"><Network size={22} /></span><div><strong>HIMOTO</strong><small>Hệ thống cơ sở và nhân sự</small></div>
          <dl className="mg-org-kpis"><div><dt><Building2 size={13} />Cơ sở</dt><dd>{stores.length}</dd></div><div><dt><Users size={13} />Nhân sự</dt><dd>{shown.length}</dd></div><div><dt>Đang làm việc</dt><dd>{working}</dd></div></dl></div>
        {departments.length > 0 && <div className="mg-org-tier"><h3 className="mg-org-tier-title">Bộ phận trụ sở công ty<span>{departments.length}</span></h3>
          <div className="mg-org-grid">{departments.map((department, index) => <article className={`mg-org-card mg-org-tone-${index % 6}`} key={department.role}>
            <header><h3>{department.label}</h3><span>{department.people.length} nhân sự</span></header><div className="mg-org-people">{department.people.map(person => <PersonCard key={person.id} person={person}
              position={department.role === 'QLCN' && staffRoles(person.position).includes('Leader') ? 'Leader' : department.role} onAction={onAction} />)}</div></article>)}</div></div>}
        {unassigned.length > 0 && <div className="mg-org-tier"><h3 className="mg-org-tier-title">Chưa phân bổ cơ sở<span>{unassigned.length}</span></h3>
          <div className="mg-org-grid">{staffGroups(unassigned).map(([position, people]) => <article className="mg-org-card mg-org-tone-unassigned" key={position}>
            <header><h3>{position}</h3><span>{people.length}</span></header><div className="mg-org-people">{people.map(person => <PersonCard key={person.id} person={person} onAction={onAction} />)}</div></article>)}</div></div>}
        <div className="mg-org-tier"><h3 className="mg-org-tier-title">Cơ sở<span>{stores.length}</span></h3>
          <div className="mg-org-grid">{stores.map((store, index) => {
            const people = staff.filter(person => person.store_id === store.id);
            return <article className={`mg-org-card mg-org-tone-${index % 6}`} key={store.id}><header><h3>{store.name}</h3><span>{people.length} nhân sự</span></header>
              {people.length ? <Groups people={people} onAction={onAction} /> : <p className="mg-org-empty">Chưa có nhân sự được phân bổ.</p>}</article>;
          })}</div></div>
      </div>
    </div>}
    {target && <StaffDialog key={`${target.mode}-${target.person.id}`} row={target.person} mode={target.mode} stores={allStores} onClose={() => setTarget(null)}
      onSwitch={mode => setTarget(current => current && { ...current, mode })} onChanged={() => reload(['stores', 'staff'])} />}
  </section>;
}
