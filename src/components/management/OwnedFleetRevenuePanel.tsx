'use client';
import { useEffect,useState } from 'react';
import { formatMoney } from '@/lib/formatters';
import { loadOwnedFleetReport,type FleetRevenueTotals,type FleetStoreRevenue,type OwnedFleetRevenueReport } from '@/lib/management/owned-fleet-revenue';
import { rentalReportQuery,type RentalReportScope } from '@/lib/management/rental-reports';
import { Dialog } from './Dialog';

function useFleetReport(query:URLSearchParams,revision:number) {
  const key=query.toString();
  const [loaded,setLoaded]=useState<{key:string;value:OwnedFleetRevenueReport}|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    loadOwnedFleetReport(new URLSearchParams(key),controller.signal).then(value=>{if(!controller.signal.aborted)setLoaded({key,value});})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được báo cáo đội xe.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[key,revision,retry]);
  return {report:loaded?.key===key?loaded.value:null,loading:loading||(!error&&loaded?.key!==key),error,reload:()=>setRetry(value=>value+1)};
}
function ReportState({loading,error,reload}:{loading:boolean;error:string;reload:()=>void}) {
  return loading?<p className="mg-table-state" role="status">Đang tải doanh thu đội xe…</p>:error?<p className="mg-field-error" role="alert">{error} <button type="button" className="mg-button" onClick={reload}>Thử lại báo cáo đội xe</button></p>:null;
}
function FleetSummary({total}:{total:FleetRevenueTotals}) {
  return <>
    <p>{total.vehicles.toLocaleString('vi-VN')} xe chủ quản · {total.local_vehicles.toLocaleString('vi-VN')} xe đang quản lý tại cơ sở gốc · {total.away_vehicles.toLocaleString('vi-VN')} xe đã chuyển sang cơ sở khác</p>
    <dl className="mg-owned-fleet-kpis">
      <div><dt>Doanh thu từ xe trực tiếp cho khách thuê</dt><dd>{formatMoney(total.direct_revenue)}</dd></div>
      <div><dt>Doanh thu từ xe cho cơ sở khác mượn</dt><dd>{formatMoney(total.loan_revenue)}</dd></div>
      <div><dt>Tổng doanh thu đội xe</dt><dd>{formatMoney(total.revenue)}</dd></div>
    </dl>
    {total.unassigned_rentals>0&&<p className="mg-rental-revenue-note" role="status">Có {total.unassigned_rentals} lượt thuê chưa xác định cơ sở lập hợp đồng: {formatMoney(total.unassigned_revenue)}. Khoản này được ghi riêng trong tổng, chưa xếp vào hai nguồn doanh thu.</p>}
  </>;
}
function FleetVehicleDetails({row,scope,onClose}:{row:FleetStoreRevenue;scope:RentalReportScope;onClose:()=>void}) {
  const [page,setPage]=useState(1),[size,setSize]=useState(10);
  const query=rentalReportQuery({...scope,store:String(row.store_id)});query.set('view','vehicles');query.set('page',String(page));query.set('size',String(size));
  const state=useFleetReport(query,0),report=state.report?.view==='vehicles'?state.report:null;
  const ready=report&&!state.loading&&!state.error,unknown=Boolean(report?.total.unassigned_rentals);
  const pages=Math.max(1,Math.ceil((report?.total.vehicles||0)/size)),active=report?.page||page;
  return <Dialog title={`Đội xe chủ quản · ${row.store_name}`} subtitle={`${scope.from} – ${scope.to} · Chỉ xem`} onClose={onClose}>
    <div className="mg-dialog-body"><ReportState {...state}/>{ready&&<>
      <FleetSummary total={report.total}/>
      <p className="mg-rental-revenue-note">Đủ xe thuộc cơ sở này, kể cả xe chưa có doanh thu. Cơ sở đang giữ xe không làm đổi cơ sở chủ quản. Sắp xếp theo doanh thu giảm dần.</p>
      <div className="mg-mobile-records mg-report-mobile" role="region" aria-label="Thẻ đội xe chủ quản">{report.rows.map(vehicle=><article key={vehicle.id} className="mg-report-card"><strong>{vehicle.name} · {vehicle.license||'Chưa có biển số'}</strong><p>Đang quản lý: {vehicle.current_store_name} · {vehicle.rentals} lượt thuê</p><dl>
        <div><dt>Trực tiếp cho khách thuê</dt><dd>{formatMoney(vehicle.direct_revenue)}</dd></div>
        <div><dt>Cho cơ sở khác mượn</dt><dd>{formatMoney(vehicle.loan_revenue)}</dd></div>
        {unknown&&<div><dt>Chưa xác định cơ sở lập HĐ</dt><dd>{formatMoney(vehicle.unassigned_revenue)}</dd></div>}
        <div><dt>Tổng doanh thu</dt><dd>{formatMoney(vehicle.revenue)}</dd></div>
      </dl></article>)}</div>
      <div className="mg-table-scroll mg-desktop-records" role="region" aria-label="Chi tiết doanh thu đội xe chủ quản" tabIndex={0}><table className="mg-table"><thead><tr><th scope="col">Xe / biển số</th><th scope="col">Cơ sở đang quản lý</th><th scope="col">Lượt thuê</th><th scope="col">Trực tiếp cho khách thuê</th><th scope="col">Cho cơ sở khác mượn</th>{unknown&&<th scope="col">Chưa xác định cơ sở lập HĐ</th>}<th scope="col">Tổng doanh thu</th></tr></thead><tbody>
        {report.rows.map(vehicle=><tr key={vehicle.id}><th scope="row">{vehicle.name}<br/>{vehicle.license||'Chưa có biển số'}</th><td>{vehicle.current_store_name}</td><td>{vehicle.rentals}</td><td>{formatMoney(vehicle.direct_revenue)}</td><td>{formatMoney(vehicle.loan_revenue)}</td>{unknown&&<td>{formatMoney(vehicle.unassigned_revenue)}</td>}<td><strong>{formatMoney(vehicle.revenue)}</strong></td></tr>)}
        {!report.rows.length&&<tr><td colSpan={unknown?7:6}>Cơ sở chưa có xe trong danh mục.</td></tr>}
      </tbody><tfoot><tr><th scope="row" colSpan={2}>Tổng toàn bộ {report.total.vehicles} xe</th><td>{report.total.rentals}</td><td>{formatMoney(report.total.direct_revenue)}</td><td>{formatMoney(report.total.loan_revenue)}</td>{unknown&&<td>{formatMoney(report.total.unassigned_revenue)}</td>}<td>{formatMoney(report.total.revenue)}</td></tr></tfoot></table></div>
    </>}
    <nav className="mg-report-pagination" aria-label="Phân trang đội xe chủ quản"><span>{report?.total.vehicles??'—'} xe · Trang {active} / {pages}</span><div><label>Số dòng <select aria-label="Số xe mỗi trang" value={size} onChange={event=>{setSize(Number(event.target.value));setPage(1);}}>{[10,20,50].map(value=><option key={value} value={value}>{value}</option>)}</select></label>
      <button type="button" className="mg-button" disabled={state.loading||active<=1} onClick={()=>setPage(1)}>Trang đầu</button><button type="button" className="mg-button" disabled={state.loading||active<=1} onClick={()=>setPage(active-1)}>Trước</button><button type="button" className="mg-button" disabled={state.loading||active>=pages} onClick={()=>setPage(active+1)}>Sau</button><button type="button" className="mg-button" disabled={state.loading||active>=pages} onClick={()=>setPage(pages)}>Trang cuối</button>
    </div></nav></div>
    <div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={onClose}>Đóng</button></div>
  </Dialog>;
}
export function OwnedFleetRevenuePanel({from,to,store,retry}:RentalReportScope&{retry:number}) {
  const [selected,setSelected]=useState<FleetStoreRevenue|null>(null);
  const state=useFleetReport(rentalReportQuery({from,to,store}),retry),report=state.report?.view==='stores'?state.report:null;
  const ready=report&&!state.loading&&!state.error,unknown=Boolean(report?.total.unassigned_rentals);
  return <section className="mg-rental-revenue mg-data-panel" aria-label="Doanh thu xe theo cơ sở chủ quản" aria-busy={state.loading}>
    <div className="mg-rental-revenue-heading"><div><h2>Doanh thu xe theo cơ sở chủ quản</h2><p>Tính cả xe trực tiếp cho thuê và xe cho cơ sở khác mượn · Chỉ xem</p></div><strong>{ready?formatMoney(report.total.revenue):'—'}</strong></div>
    <p className="mg-rental-revenue-note">Cơ sở chủ quản là cơ sở gốc của xe, không đổi khi điều chuyển. Trực tiếp: hợp đồng do cơ sở chủ quản lập. Cho cơ sở khác mượn: hợp đồng do cơ sở khác lập trên xe thuộc cơ sở chủ quản. Bộ lọc cơ sở tại tab này chọn cơ sở chủ quản.</p>
    <p className="mg-rental-revenue-note">Cùng cách tính Doanh thu từng xe: các lượt thuê bắt đầu trong kỳ, gồm phí thuê + gia hạn + điều chỉnh trả muộn / trả sớm; không gồm cọc và phí sửa chữa. Số xe là danh mục hiện tại. Doanh thu phân theo cơ sở lập hợp đồng tại thời điểm thuê, không theo nơi giữ xe hôm nay.</p>
    <ReportState {...state}/>{ready&&<>
      <FleetSummary total={report.total}/>
      <div className="mg-mobile-records mg-report-mobile" role="region" aria-label="Thẻ doanh thu xe theo cơ sở">{report.rows.map(row=><article key={row.store_id} className="mg-report-card"><h3>{row.store_name}</h3><p>{row.vehicles} xe · {row.local_vehicles} tại cơ sở gốc · {row.away_vehicles} ở cơ sở khác</p><dl>
        <div><dt>Trực tiếp cho khách thuê</dt><dd>{formatMoney(row.direct_revenue)}</dd></div><div><dt>Cho cơ sở khác mượn</dt><dd>{formatMoney(row.loan_revenue)}</dd></div>{unknown&&<div><dt>Chưa xác định cơ sở lập HĐ</dt><dd>{formatMoney(row.unassigned_revenue)}</dd></div>}<div><dt>Tổng doanh thu đội xe</dt><dd>{formatMoney(row.revenue)}</dd></div>
      </dl><button type="button" className="mg-button" aria-label={`Xem đội xe ${row.store_name}`} onClick={()=>setSelected(row)}>Xem {row.vehicles} xe</button></article>)}</div>
      <div className="mg-table-scroll mg-desktop-records" role="region" aria-label="Doanh thu xe theo cơ sở chủ quản" tabIndex={0}><table className="mg-table"><thead><tr><th scope="col">Cơ sở chủ quản</th><th scope="col">Tổng xe</th><th scope="col">Tại cơ sở gốc</th><th scope="col">Ở cơ sở khác</th><th scope="col">Doanh thu từ xe trực tiếp cho khách thuê</th><th scope="col">Doanh thu từ xe cho cơ sở khác mượn</th>{unknown&&<th scope="col">Chưa xác định cơ sở lập HĐ</th>}<th scope="col">Tổng doanh thu đội xe</th><th scope="col">Chi tiết</th></tr></thead><tbody>
        {report.rows.map(row=><tr key={row.store_id}><th scope="row">{row.store_name}</th><td>{row.vehicles}</td><td>{row.local_vehicles}</td><td>{row.away_vehicles}</td><td>{formatMoney(row.direct_revenue)}</td><td>{formatMoney(row.loan_revenue)}</td>{unknown&&<td>{formatMoney(row.unassigned_revenue)}</td>}<td><strong>{formatMoney(row.revenue)}</strong></td><td><button type="button" className="mg-button" aria-label={`Xem đội xe ${row.store_name}`} onClick={()=>setSelected(row)}>Xem xe</button></td></tr>)}
        {!report.rows.length&&<tr><td colSpan={unknown?9:8}>Không có xe thuộc cơ sở đang chọn.</td></tr>}
      </tbody><tfoot><tr><th scope="row">Tổng</th><td>{report.total.vehicles}</td><td>{report.total.local_vehicles}</td><td>{report.total.away_vehicles}</td><td>{formatMoney(report.total.direct_revenue)}</td><td>{formatMoney(report.total.loan_revenue)}</td>{unknown&&<td>{formatMoney(report.total.unassigned_revenue)}</td>}<td>{formatMoney(report.total.revenue)}</td><td/></tr></tfoot></table></div>
    </>}
    {selected&&<FleetVehicleDetails row={selected} scope={{from,to,store}} onClose={()=>setSelected(null)}/>}
  </section>;
}
