'use client';

import { FilteredExcelButton } from './FilteredExcelButton';
import { useRouter } from 'next/navigation';
import { ATTENDANCE_SHIFTS, shiftCreditLabel } from '@/lib/management/attendance-shifts';
import { useManagement } from './ManagementProvider';

export function StoreWorkShifts({ storeId, onClose }: { storeId?: number; onClose?: () => void }) {
  const { selectStore } = useManagement();
  const router = useRouter();
  return <div>
    <div className="mg-page-heading"><div><h2>Ca làm việc</h2><p>Danh mục ca dùng chung cho các cơ sở. Phân ca cho nhân viên tại Lịch trực cơ sở.</p></div>
      <FilteredExcelButton filename="himoto-ca-lam-viec" disabled={!ATTENDANCE_SHIFTS.length} headers={['Mã ca','Tên ca','Giờ vào','Giờ ra','Số công']} getRows={()=>ATTENDANCE_SHIFTS.map(s=>[s.code,s.name,s.start,s.end,s.credit])}/>
      <button type="button" className="mg-button mg-button-primary" onClick={() => {
        if (storeId) selectStore(String(storeId));
        onClose?.(); router.push('/duty-roster');
      }}>Phân ca tại Lịch trực cơ sở</button></div>
    <div className="mg-table-scroll" role="region" aria-label="Danh mục ca làm việc" tabIndex={0}>
      <table className="mg-table"><thead><tr><th scope="col">Mã ca</th><th scope="col">Tên ca</th><th scope="col">Giờ vào</th><th scope="col">Giờ ra</th><th scope="col">Số công</th></tr></thead>
        <tbody>{ATTENDANCE_SHIFTS.map(shift => <tr key={shift.code}><td><strong>{shift.code}</strong></td><td>{shift.name}</td><td>{shift.start || '—'}</td><td>{shift.end || '—'}</td><td>{shiftCreditLabel(shift.credit)}</td></tr>)}</tbody>
      </table>
    </div>
  </div>;
}
