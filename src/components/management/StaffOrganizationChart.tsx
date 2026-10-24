'use client';

import { useId, useMemo, useState } from 'react';
import { Building2, Eye, Network, Pencil, Phone, RotateCcw, Search, Trash2, Users, X } from 'lucide-react';
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
const searchKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
const staffHaystack = (person: ManagementRow) => [person.name, person.code, person.phone, person.email, person.position, person.store_name].map(part => String(part || '')).join(' ');
const matchesStaff = (person: ManagementRow, query: string) => {
  const needle = searchKey(query.trim());
  return !needle || searchKey(staffHaystack(person)).includes(needle);
};

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
  const [search, setSearch] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeSuggest, setActiveSuggest] = useState(-1);
  const listId = useId();
  const allStores = dataset?.stores || [];
  const allStaff = useMemo(() => dataset?.staff || [],[dataset?.staff]);
  const scopedStaff = useMemo(() => allStaff.filter(person => {
    // TLS is company-wide: keep visible when filtering any store.
    const companyTls = staffRoles(person.position).includes('TLS');
    if (selectedStore !== 'all' && String(person.store_id || '') !== selectedStore && !companyTls) return false;
    return showDeparted || person.status !== 'leave' || (search.trim() !== '' && matchesStaff(person, search));
  }), [allStaff, selectedStore, showDeparted, search]);
  const suggestions = useMemo(() => {
    const needle = search.trim();
    if (!needle) return [];
    return scopedStaff.filter(person => matchesStaff(person, needle))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'))
      .slice(0, 12);
  }, [scopedStaff, search]);
  const staff = useMemo(() => search.trim() ? scopedStaff.filter(person => matchesStaff(person, search)) : scopedStaff, [scopedStaff, search]);
  const stores = allStores.filter(store => selectedStore === 'all' || String(store.id) === selectedStore);
  // TLS stays company-wide: always list that department, even when a store filter is on.
  const departmentDefs = selectedStore === 'all' ? STAFF_DEPARTMENTS : STAFF_DEPARTMENTS.filter(department => department.role === 'TLS');
  const departments = departmentDefs.map(department => ({ ...department,
    people: staff.filter(person => staffRoles(person.position).includes(department.role) && (department.role !== 'NVKD' || !person.store_id)),
  })).filter(department => department.people.length);
  const unassigned = selectedStore === 'all' ? staff.filter(person => !allStores.some(store => store.id === person.store_id) && !departments.some(department => department.people.includes(person))) : [];
  const shown = staff.filter(person => unassigned.includes(person) || departments.some(department => department.people.includes(person)) || stores.some(store => store.id === person.store_id) || staffRoles(person.position).includes('TLS'));
  const working = shown.filter(person => !INACTIVE_LABEL[person.status]).length;
  const onAction: PersonProps['onAction'] = (person, mode) => setTarget({ person, mode });
  function pickStaff(person: ManagementRow) {
    setSearch(String(person.name || person.code || ''));
    setSuggestOpen(false);
    setActiveSuggest(-1);
    if (person.status === 'leave') setShowDeparted(true);
    setTarget({ person, mode: 'view' });
  }
  const searchField = (
    <div className="mg-org-staff-search" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) { setSuggestOpen(false); setActiveSuggest(-1); } }}>
      <label className="mg-search" htmlFor="staff-org-search"><Search size={17} /><span className="mg-sr-only">Tìm nhân sự</span>
        <input id="staff-org-search" type="search" role="combobox" aria-expanded={suggestOpen} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={suggestOpen && suggestions[activeSuggest] ? `${listId}-${activeSuggest}` : undefined}
          placeholder="Tìm nhân sự theo mã, tên hoặc số điện thoại…" value={search} autoComplete="off"
          onFocus={() => setSuggestOpen(true)}
          onChange={event => { setSearch(event.target.value); setSuggestOpen(true); setActiveSuggest(-1); }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault(); setSuggestOpen(true);
              setActiveSuggest(current => !suggestions.length ? -1 : current < 0 ? (event.key === 'ArrowDown' ? 0 : suggestions.length - 1) : (current + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length);
            } else if (event.key === 'Enter' && suggestOpen && suggestions[activeSuggest]) { event.preventDefault(); pickStaff(suggestions[activeSuggest]); }
            else if (event.key === 'Escape' && suggestOpen) { event.preventDefault(); setSuggestOpen(false); setActiveSuggest(-1); }
          }} />
        {search && <button type="button" aria-label="Xóa từ khóa" onClick={() => { setSearch(''); setSuggestOpen(false); setActiveSuggest(-1); }}><X size={15} /></button>}
      </label>
      {suggestOpen && search.trim() && <div className="mg-org-search-popup" id={listId} role="listbox" aria-label="Gợi ý nhân sự">
        {suggestions.length ? suggestions.map((person, index) => {
          const name = person.name || '—';
          const meta = [person.code, normalizeStaffPosition(person.position) || person.position, person.store_name || 'Trụ sở công ty', person.phone].filter(Boolean).join(' · ');
          return <button type="button" role="option" id={`${listId}-${index}`} key={person.id} className={activeSuggest === index ? 'is-active' : ''}
            aria-selected={activeSuggest === index} onMouseDown={event => event.preventDefault()} onClick={() => pickStaff(person)}>
            <strong>{name}</strong><span>{meta}</span>
          </button>;
        }) : <p className="mg-org-search-empty">Không tìm thấy nhân sự phù hợp.</p>}
      </div>}
    </div>
  );
  return <section className="mg-org-section" aria-labelledby="staff-org-title">
    <div className="mg-org-heading">
      <div className="mg-org-heading-copy">
        <span className="mg-eyebrow">CƠ CẤU TỔ CHỨC</span>
        <h2 id="staff-org-title">Sơ đồ nhân sự</h2>
        <p>Nhân sự và cơ sở theo dữ liệu hiện tại trên hệ thống. Xem, sửa hoặc xóa trực tiếp trên từng thẻ nhân sự.</p>
        <div className="mg-org-toolbar" role="search" aria-label="Tìm nhân sự trên sơ đồ">
          {searchField}
          {search.trim() && <span className="mg-org-search-count" aria-live="polite"><strong>{shown.length}</strong> nhân sự khớp</span>}
        </div>
      </div>
      <div className="mg-org-heading-actions">
        <label><input type="checkbox" checked={showDeparted} onChange={event => setShowDeparted(event.target.checked)} />Hiện nhân sự đã nghỉ việc</label>
        <button type="button" className="mg-button" disabled={loading || refreshing} onClick={() => void reload()}><RotateCcw size={16} className={refreshing ? 'mg-spin' : undefined} />{refreshing ? 'Đang tải…' : 'Làm mới'}</button>
      </div>
    </div>
    {loading ? <p role="status">Đang tải sơ đồ nhân sự…</p> : error ? <p role="alert">Không tải được sơ đồ nhân sự. Vui lòng thử lại.</p> : <div className="mg-org-scroll" tabIndex={0} role="region" aria-label="Sơ đồ nhân sự">
      <div className="mg-org-chart">
        <div className="mg-org-root"><span className="mg-org-root-icon" aria-hidden="true"><Network size={22} /></span><div><strong>HIMOTO</strong><small>Hệ thống cơ sở và nhân sự</small></div>
          <dl className="mg-org-kpis"><div><dt><Building2 size={13} />Cơ sở</dt><dd>{stores.length}</dd></div><div><dt><Users size={13} />Nhân sự</dt><dd>{shown.length}</dd></div><div><dt>Bình thường</dt><dd>{working}</dd></div></dl></div>
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
              {people.length ? <Groups people={people} onAction={onAction} /> : <p className="mg-org-empty">{search.trim() ? 'Không có nhân sự khớp tìm kiếm.' : 'Chưa có nhân sự được phân bổ.'}</p>}</article>;
          })}</div></div>
      </div>
    </div>}
    {target && <StaffDialog key={`${target.mode}-${target.person.id}`} row={target.person} mode={target.mode} stores={allStores} onClose={() => setTarget(null)}
      onSwitch={mode => setTarget(current => current && { ...current, mode })} onChanged={() => reload(['stores', 'staff'])} />}
  </section>;
}
