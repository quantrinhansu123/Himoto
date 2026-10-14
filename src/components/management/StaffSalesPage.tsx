'use client';
import { useEffect,useState } from 'react';
import { ArrowDownToLine,RotateCcw } from 'lucide-react';
import { useManagement } from './ManagementProvider';
import { loadStaffSales,type StaffSalesReport } from '@/lib/management/staff-sales';
import { vietnamDate } from '@/lib/management/duty-roster';
import { csvCell } from '@/lib/management/table-utils';
const money=(value:number)=>`${value.toLocaleString('vi-VN')} đ`;
export function StaffSalesPage() {
  const {selectedStore}=useManagement();const today=vietnamDate();
  const [from,setFrom]=useState(`${today.slice(0,7)}-01`),[to,setTo]=useState(today),[department,setDepartment]=useState('');
  const [report,setReport]=useState<StaffSalesReport|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');loadStaffSales(from,to,selectedStore,controller.signal).then(setReport).catch(cause=>{if(!controller.signal.aborted){setReport(null);setError(cause instanceof Error ? cause.message : 'Không tải được doanh số.');}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[from,to,selectedStore,retry]);
  const rows=(report?.rows || []).filter(row=>!department || row.department === department);
  function exportCsv(){const data=[['Nhân viên','Bộ phận','Cách tính','Hợp đồng','Khách','Khách mới','Doanh số'],...rows.map(row=>[row.name,row.department,row.department === 'NVKD' ? 'Tiền thuê thực thu, gồm gia hạn' : 'Tiền thuê HĐ mở mới đầu tiên',row.contracts,row.customers,row.new_customers,row.revenue])].map(row=>row.map(value=>csvCell(String(value))).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF',data],{type:'text/csv;charset=utf-8;'}));const link=document.createElement('a');link.href=url;link.download=`doanh-so-${from}-${to}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
  return <section className="mg-page"><div className="mg-page-content"><div className="mg-page-heading"><div><h1>Doanh số nhân viên</h1><p>NVKD: tiền thuê thực thu trong kỳ, gồm gia hạn, không gồm cọc. TLS: tiền thuê HĐ mở mới đầu tiên, không tính thuê sở hữu, khách quay lại hoặc gia hạn.</p></div><div className="mg-heading-actions"><button className="mg-button" type="button" onClick={()=>setRetry(v=>v+1)}><RotateCcw size={16}/>Tải lại</button><button className="mg-button" type="button" disabled={loading || !rows.length} onClick={exportCsv}><ArrowDownToLine size={16}/>Xuất CSV</button></div></div>
    <div className="mg-data-panel"><div className="mg-toolbar"><label>Từ ngày<input aria-label="Từ ngày doanh số" type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Đến ngày<input aria-label="Đến ngày doanh số" type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><label>Bộ phận<select aria-label="Bộ phận doanh số" value={department} onChange={e=>setDepartment(e.target.value)}><option value="">Tất cả bộ phận</option><option value="NVKD">NVKD</option><option value="TLS">TLS</option></select></label></div>
    {loading ? <p role="status" className="mg-table-state">Đang tải doanh số…</p> : error ? <p role="alert" className="mg-field-error">{error}</p> : <><ul className="mg-sales-cards">{rows.map(row=><li key={`${row.department}-${row.staff_id}`}><strong>{row.name} · {row.department}</strong><b>{money(row.revenue)}</b><span>{row.department === 'NVKD' ? 'Tiền thuê thực thu, gồm gia hạn' : 'Tiền thuê HĐ mở mới đầu tiên'}</span><span>{row.contracts} hợp đồng · {row.customers} khách · {row.new_customers} khách mới</span></li>)}</ul>{!rows.length && <p className="mg-table-state">Chưa có doanh số được gắn nhân viên trong kỳ.</p>}</>}
    </div>
  </div></section>;
}
