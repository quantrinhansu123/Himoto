'use client';
import Link from 'next/link';
import { CalendarPlus, FilePlus2, RefreshCw, RotateCcw } from 'lucide-react';
import { useManagement } from './ManagementProvider';
const actions = [
  {href:'/contracts?action=new',label:'Làm hợp đồng',description:'Chọn khách, xe và xác nhận tiền đã nhận.',icon:FilePlus2},
  {href:'/contracts?action=return',label:'Trả xe',description:'Tìm biển số hoặc hợp đồng để nhận trả.',icon:RotateCcw},
  {href:'/contracts?action=renew',label:'Gia hạn',description:'Chọn hợp đồng và cập nhật ngày hẹn trả.',icon:CalendarPlus},
  {href:'/vehicles?action=status',label:'Đổi trạng thái xe',description:'Cập nhật xe lưu kho hoặc đang thuê.',icon:RefreshCw},
];
export function OperationsPage() {
  const {dataset,selectedStore,loading,error} = useManagement();
  const contracts = (dataset?.contracts || []).filter(row=>selectedStore === 'all' || String(row.store_id) === selectedStore);
  const active = contracts.filter(row=>['renting','overdue','wait_payment'].includes(row.status));
  return <section className="mg-page mg-operations-page"><div className="mg-page-content"><div className="mg-page-heading"><div><h1>Thao tác nhanh</h1><p>Làm hợp đồng và xử lý xe tại quầy.</p></div></div>
    <div className="mg-operation-actions">{actions.map(action=><Link className="mg-operation-action" key={action.href} href={action.href}><action.icon size={24}/><strong>{action.label}</strong><span>{action.description}</span></Link>)}</div>
    {error && <p className="mg-field-error" role="alert">{error}</p>}
    <div className="mg-operation-links"><Link href="/contracts"><strong>{loading ? '—' : active.length}</strong> hợp đồng đang thuê</Link><Link href="/contracts/overdue"><strong>{loading ? '—' : contracts.filter(row=>row.status === 'overdue').length}</strong> hợp đồng quá hạn</Link><Link href="/contracts/drafts">Tiếp tục hợp đồng nháp</Link><Link href="/contracts/due">Xem khoản đến hạn đóng tiền</Link></div>
  </div></section>;
}
