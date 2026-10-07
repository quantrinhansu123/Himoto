'use client';

import { RotateCcw } from 'lucide-react';
import { ManagementRow } from '@/lib/management/types';
import { useManagement } from './ManagementProvider';

function staffGroups(staff: ManagementRow[]) {
  const groups = new Map<string, ManagementRow[]>();
  for (const person of staff) {
    const position = String(person.position || 'Chưa có chức vụ');
    groups.set(position, [...(groups.get(position) || []), person]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b, 'vi'));
}

function PersonCard({ person }: { person: ManagementRow }) {
  return <div className="mg-org-person"><strong>{person.name || '—'}</strong><span className="mg-org-phone">{person.phone ? <a href={`tel:${person.phone}`}>{person.phone}</a> : '—'}</span></div>;
}

export function StaffOrganizationChart() {
  const { dataset, selectedStore, reload, loading, error } = useManagement();
  const staff = dataset?.staff || [];
  const stores = (dataset?.stores || []).filter(store => selectedStore === 'all' || String(store.id) === selectedStore);
  const unassigned = selectedStore === 'all' ? staff.filter(person => !stores.some(store => store.id === person.store_id)) : [];
  return <section className="mg-org-section" aria-labelledby="staff-org-title">
    <div className="mg-org-heading"><div><span className="mg-eyebrow">CƠ CẤU TỔ CHỨC</span><h2 id="staff-org-title">Sơ đồ nhân sự</h2><p>Nhân sự và cơ sở theo dữ liệu hiện tại trên hệ thống.</p></div>
      <button type="button" className="mg-button" disabled={loading} onClick={() => void reload()}><RotateCcw size={16} />Làm mới</button></div>
    {loading ? <p role="status">Đang tải sơ đồ nhân sự…</p> : error ? <p role="alert">Không tải được sơ đồ nhân sự. Vui lòng thử lại.</p> : <div className="mg-org-scroll" tabIndex={0} role="region" aria-label="Sơ đồ nhân sự, cuộn ngang để xem đầy đủ">
      <div className="mg-org-chart"><div className="mg-org-root">HIMOTO</div>
        {unassigned.length > 0 && <div className="mg-org-departments">{staffGroups(unassigned).map(([position, people], index) => <article className={`mg-org-card mg-org-tone-${index % 6}`} key={position}>
          <h3>{position} · Chưa phân bổ cơ sở</h3><div className="mg-org-people">{people.map(person => <PersonCard key={person.id} person={person} />)}</div>
        </article>)}</div>}
        <div className="mg-org-stores">{stores.map((store, index) => {
          const groups = staffGroups(staff.filter(person => person.store_id === store.id));
          return <article className={`mg-org-store mg-org-tone-${index % 6}`} key={store.id}><h3>{store.name}</h3>
            {groups.length ? groups.map(([position, people]) => <section className="mg-org-group" key={position}><h4>{position}</h4><div className="mg-org-people">{people.map(person => <PersonCard key={person.id} person={person} />)}</div></section>) : <p>Chưa có nhân sự được phân bổ.</p>}
          </article>;
        })}</div>
      </div>
    </div>}
  </section>;
}
