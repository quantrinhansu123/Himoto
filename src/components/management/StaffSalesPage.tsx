'use client';
import { useCallback,useEffect,useState } from 'react';
import { ArrowDownToLine,CalendarRange,FilterX,Receipt,RotateCcw,TrendingUp,TriangleAlert,Wallet } from 'lucide-react';
import { useManagement } from './ManagementProvider';
import { useReloadAction } from './ReloadButton';
import { SalesCharts } from './SalesCharts';
import {RentalRevenuePanel} from './RentalRevenuePanel';
import { RentalOverviewPanel, VehicleRevenuePanel } from './RentalReportPanels';
import { OwnedFleetRevenuePanel } from './OwnedFleetRevenuePanel';
import { canViewOwnedFleetRevenue } from '@/lib/management/permissions';
import { loadSalesSummary,loadStaffSales,type StaffSalesReport,type SalesSummaryReport } from '@/lib/management/staff-sales';
import { summarizeBySalesStaff,summarizeByStore,summarizeSalesKpis,type SalesKpis,type SourceSalesSummary } from '@/lib/management/source-sales';
import { vietnamDate } from '@/lib/management/duty-roster';
import { csvCell } from '@/lib/management/table-utils';
const money=(value:number)=>`${value.toLocaleString('vi-VN')} đ`;
function downloadCsv(rows:(string|number)[][],filename:string){const data=rows.map(row=>row.map(value=>csvCell(String(value))).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF',data],{type:'text/csv;charset=utf-8;'}));const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
const isoDate=(year:number,month:number,day:number)=>new Date(Date.UTC(year,month,day)).toISOString().slice(0,10);
const viDate=(value:string)=>value.split('-').reverse().join('/');
const PRESETS=[{id:'today',label:'Hôm nay'},{id:'yesterday',label:'Hôm qua'},{id:'7d',label:'7 ngày qua'},{id:'month',label:'Tháng này'},{id:'last-month',label:'Tháng trước'},{id:'quarter',label:'Quý này'},{id:'year',label:'Năm nay'}] as const;
function presetRange(id:typeof PRESETS[number]['id'],today:string):[string,string] {
  const [year,month,day]=today.split('-').map(Number);
  switch(id){
    case 'today': return [today,today];
    case 'yesterday': return [isoDate(year,month-1,day-1),isoDate(year,month-1,day-1)];
    case '7d': return [isoDate(year,month-1,day-6),today];
    case 'month': return [isoDate(year,month-1,1),today];
    case 'last-month': return [isoDate(year,month-2,1),isoDate(year,month-1,0)];
    case 'quarter': return [isoDate(year,Math.floor((month-1)/3)*3,1),today];
    case 'year': return [isoDate(year,0,1),today];
  }
}
const DEPARTMENTS=[{value:'',label:'Tất cả'},{value:'NVKD',label:'NVKD'},{value:'TLS',label:'TLS'}];
function SalesKpiCards({kpis,loading,error}:{kpis:SalesKpis;loading:boolean;error:string}) {
  const ready=!loading && !error;
  const rate=kpis.revenue ? Math.min(Math.round(kpis.paid/kpis.revenue*100),100) : 0;
  const cards=[
    {key:'revenue',icon:TrendingUp,label:'Tổng doanh số',value:kpis.revenue,hint:`${kpis.contracts.toLocaleString('vi-VN')} hợp đồng bắt đầu trong kỳ`},
    {key:'paid',icon:Wallet,label:'Số tiền đã thu',value:kpis.paid,hint:`Đạt ${rate}% tổng doanh số`,progress:rate},
    {key:'debt',icon:Receipt,label:'Công nợ',value:kpis.debt,hint:`${kpis.debtContracts.toLocaleString('vi-VN')} hợp đồng còn thiếu tiền`},
    {key:'overdue',icon:TriangleAlert,label:'Nợ xấu quá hạn',value:kpis.overdueDebt,hint:`${kpis.overdueContracts.toLocaleString('vi-VN')} hợp đồng · nợ xấu ${money(kpis.badDebt)}`},
  ];
  return <dl className="mg-sales-kpis" aria-busy={loading}>{cards.map(({key,icon:Icon,label,value,hint,progress})=><div key={key} className={`mg-sales-kpi is-${key}`}>
    <dt><span className="mg-sales-kpi-icon" aria-hidden="true"><Icon size={16}/></span>{label}</dt>
    <dd>{ready ? money(value) : '—'}</dd>
    {progress!==undefined && <div className="mg-sales-kpi-bar" aria-hidden="true"><span style={{width:`${ready ? progress : 0}%`}}/></div>}
    <span>{loading ? 'Đang tải…' : error ? error : hint}</span>
  </div>)}</dl>;
}
const SUMMARY_HEADERS=['Hợp đồng','Khách','Tiền thuê','Đã thu tiền thuê','Tiền cọc'];
function SummaryTable({title,description,column,unit,summary,filename,loading,error}:{title:string;description:string;column:string;unit:string;summary:SourceSalesSummary;filename:string;loading:boolean;error:string}) {
  const {rows,total}=summary;
  return <div className="mg-source-sales"><div className="mg-source-sales-heading"><div><h2>{title}</h2><p>{description}</p></div><button className="mg-button" type="button" disabled={loading || !rows.length} onClick={()=>downloadCsv([[column,...SUMMARY_HEADERS],...rows.map(row=>[row.name,row.contracts,row.customers,row.rent,row.paid,row.deposit]),['Tổng',total.contracts,total.customers,total.rent,total.paid,total.deposit]],filename)}><ArrowDownToLine size={16}/>Xuất CSV</button></div>
    {loading ? <p role="status" className="mg-table-state">Đang tải danh sách hợp đồng…</p> : error ? <p role="alert" className="mg-field-error">{error}</p> : !rows.length ? <p className="mg-table-state">Không có hợp đồng trong kỳ.</p> :
    <><SalesCharts summary={summary} unit={unit}/><div className="mg-table-scroll" tabIndex={0} role="region" aria-label={title}><table className="mg-table mg-source-sales-table"><thead><tr><th scope="col">{column}</th>{SUMMARY_HEADERS.map(label=><th scope="col" key={label} className="mg-align-right">{label}</th>)}</tr></thead>
      <tbody>{rows.map(row=><tr key={row.key || 'none'} className={row.key ? undefined : 'is-muted'}><td>{row.name}</td><td className="mg-align-right">{row.contracts}</td><td className="mg-align-right">{row.customers}</td><td className="mg-align-right">{money(row.rent)}</td><td className="mg-align-right">{money(row.paid)}</td><td className="mg-align-right">{money(row.deposit)}</td></tr>)}</tbody>
      <tfoot><tr><th scope="row">Tổng</th><td className="mg-align-right">{total.contracts}</td><td className="mg-align-right">{total.customers}</td><td className="mg-align-right">{money(total.rent)}</td><td className="mg-align-right">{money(total.paid)}</td><td className="mg-align-right">{money(total.deposit)}</td></tr></tfoot></table></div></>}
  </div>;
}
export function StaffSalesPage() {
  const {selectedStore,dataset,error:datasetError,resources,reload,accessUser,ensureData}=useManagement();const today=vietnamDate();
  const canViewFleet=canViewOwnedFleetRevenue(accessUser);
  const [from,setFrom]=useState(`${today.slice(0,7)}-01`),[to,setTo]=useState(today),[department,setDepartment]=useState('');
  const [reportView, setReportView] = useState<'actual' | 'vehicles' | 'overview' | 'owned-fleet'>('actual');
  const [toolsOpen,setToolsOpen]=useState(false);
  const [report,setReport]=useState<StaffSalesReport|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useReloadAction(useCallback(()=>{setRetry(value=>value+1);void reload();},[reload]));
  useEffect(()=>{if(!toolsOpen)return;const controller=new AbortController();setLoading(true);setError('');loadStaffSales(from,to,selectedStore,controller.signal).then(value=>{if(!controller.signal.aborted)setReport(value);}).catch(cause=>{if(!controller.signal.aborted){setReport(null);setError(cause instanceof Error ? cause.message : 'Không tải được doanh số.');}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[toolsOpen,from,to,selectedStore,retry]);
  const rows=(report?.rows || []).filter(row=>!department || row.department === department);
  const [summary,setSummary]=useState<SalesSummaryReport|null>(null),[summaryLoading,setSummaryLoading]=useState(true),[summaryError,setSummaryError]=useState('');
  const staff=dataset?.staff;
  useEffect(()=>{if(toolsOpen)void ensureData(['staff']).catch(()=>{});},[toolsOpen,ensureData]);
  useEffect(()=>{if(!toolsOpen||!resources.staff.loaded&&!resources.staff.error)return;const controller=new AbortController();setSummaryLoading(true);setSummaryError('');loadSalesSummary(from,to,selectedStore,staff||[],controller.signal).then(value=>{if(!controller.signal.aborted)setSummary(value);}).catch(cause=>{if(!controller.signal.aborted)setSummaryError(cause instanceof Error?cause.message:'Không tải được thống kê.');}).finally(()=>{if(!controller.signal.aborted)setSummaryLoading(false);});return()=>controller.abort();},[toolsOpen,from,to,selectedStore,staff,retry,resources.contracts,resources.staff.loaded,resources.staff.error]);
  const sources=summary?.sources||summarizeBySalesStaff([],from,to,selectedStore),stores=summary?.stores||summarizeByStore([],from,to,selectedStore),kpis=summary?.kpis||summarizeSalesKpis([],from,to,selectedStore),contractsError=summaryError||datasetError;
  const activePreset=PRESETS.find(preset=>{const [start,end]=presetRange(preset.id,today);return start===from && end===to;})?.id;
  const periodDays=Math.round((Date.parse(to)-Date.parse(from))/86400000)+1;
  const storeName=selectedStore==='all' ? 'Tất cả cơ sở' : dataset?.stores.find(store=>String(store.id)===selectedStore)?.name || `Cơ sở #${selectedStore}`;
  const isDefault=activePreset==='month' && !department;
  function choosePreset(id:typeof PRESETS[number]['id']){const [start,end]=presetRange(id,today);setFrom(start);setTo(end);}
  function changeFrom(value:string){if(!value)return;setFrom(value);if(value>to)setTo(value);}
  function changeTo(value:string){if(!value)return;setTo(value);if(value<from)setFrom(value);}
  const scope='Hợp đồng có ngày bắt đầu thuê trong kỳ; không tính nháp, giữ xe / chờ nhận xe và đã hủy.';
  function exportCsv(){downloadCsv([['Nhân viên','Bộ phận','Cách tính','Hợp đồng','Khách','Khách mới','Doanh số'],...rows.map(row=>[row.name,row.department,row.department === 'NVKD' ? 'Tiền thuê thực thu, gồm gia hạn' : 'Tiền thuê HĐ mở mới đầu tiên',row.contracts,row.customers,row.new_customers,row.revenue])],`doanh-so-${from}-${to}.csv`);}
  return <section className="mg-page"><div className="mg-page-content"><div className="mg-page-heading"><div><h1>Báo cáo doanh thu thuê xe</h1><p>Doanh thu thực thu, doanh thu từng xe và tổng quan thuê xe theo cơ sở / ngày.</p></div><div className="mg-heading-actions"><button className="mg-button" type="button" onClick={()=>{setRetry(v=>v+1);void reload();}}><RotateCcw size={16}/>Tải lại</button></div></div>
    <div className="mg-data-panel"><div className="mg-sales-filter" role="search" aria-label="Bộ lọc doanh số">
      <div className="mg-sales-filter-presets" role="group" aria-label="Chọn nhanh kỳ báo cáo">{PRESETS.map(preset=><button key={preset.id} type="button" className={activePreset===preset.id ? 'is-active' : ''} aria-pressed={activePreset===preset.id} onClick={()=>choosePreset(preset.id)}>{preset.label}</button>)}</div>
      <div className="mg-sales-filter-row">
        <div className="mg-sales-filter-field"><span className="mg-sales-filter-label">Khoảng ngày</span><div className="mg-sales-filter-range"><CalendarRange size={16} aria-hidden="true"/><input aria-label="Từ ngày doanh số" type="date" value={from} max={today} onChange={e=>changeFrom(e.target.value)}/><span aria-hidden="true">→</span><input aria-label="Đến ngày doanh số" type="date" value={to} max={today} onChange={e=>changeTo(e.target.value)}/></div></div>
        <button type="button" className="mg-button mg-sales-filter-reset" disabled={isDefault} onClick={()=>{choosePreset('month');setDepartment('');}}><FilterX size={16}/>Đặt lại</button>
      </div>
      <p className="mg-sales-filter-summary">Kỳ báo cáo <strong>{viDate(from)} – {viDate(to)}</strong> · {periodDays} ngày · {storeName}</p>
    </div>
    <div className="mg-report-views" role="group" aria-label="Chọn báo cáo">{([
      ['actual', 'Doanh thu thực thu / NVKD'], ['vehicles', 'Doanh thu từng xe'], ['overview', 'Tổng quan thuê xe'],
    ] as const).map(([key, label]) => <button key={key} type="button" className={`mg-button${reportView === key ? ' is-active' : ''}`} aria-pressed={reportView === key} onClick={() => setReportView(key)}>{label}</button>)}{canViewFleet&&<button type="button" className={`mg-button${reportView==='owned-fleet'?' is-active':''}`} aria-pressed={reportView==='owned-fleet'} onClick={()=>setReportView('owned-fleet')}>Doanh thu xe theo cơ sở</button>}</div>
    {reportView === 'actual' && <RentalRevenuePanel key={`actual-${from}-${to}-${selectedStore}`} from={from} to={to} store={selectedStore} retry={retry}/>}
    {reportView === 'vehicles' && <VehicleRevenuePanel key={`vehicles-${from}-${to}-${selectedStore}`} from={from} to={to} store={selectedStore} retry={retry}/>}
    {reportView === 'overview' && <RentalOverviewPanel key={`overview-${from}-${to}-${selectedStore}`} from={from} to={to} store={selectedStore} retry={retry}/>}
    {canViewFleet&&reportView==='owned-fleet'&&<OwnedFleetRevenuePanel key={`fleet-${from}-${to}-${selectedStore}`} from={from} to={to} store={selectedStore} retry={retry}/>}
    <details className="mg-monitor-tools" onToggle={event=>setToolsOpen(event.currentTarget.open)}><summary>Thống kê hợp đồng & báo cáo khác</summary>
    {toolsOpen&&<>
    <p className="mg-sales-kpi-note">Các thống kê bên dưới dùng phạm vi và cách tính ghi tại từng mục. Chốt KPI thuê xe theo bảng Doanh thu thuê xe phía trên.</p>
    <SalesKpiCards kpis={kpis} loading={summaryLoading} error={contractsError}/>
    <p className="mg-sales-kpi-note">Tính trên hợp đồng bắt đầu thuê trong kỳ, không gồm cọc. Công nợ = tiền hợp đồng còn thiếu của đơn đang thuê, quá hạn, chờ tất toán và nợ xấu; Nợ xấu quá hạn gồm đơn Quá hạn và Nợ xấu.</p>
    <SummaryTable title="Theo NVKD ghi nhận doanh số" description={`Tổng hợp từ Danh sách hợp đồng theo cột NVKD ghi nhận doanh số. ${scope}`} column="NVKD ghi nhận doanh số" unit="nhân viên" summary={sources} filename={`doanh-so-nvkd-${from}-${to}.csv`} loading={summaryLoading} error={contractsError}/>
    <SummaryTable title="Doanh thu theo cơ sở" description={`Tổng hợp từ Danh sách hợp đồng theo cột Nguồn / doanh thu. ${scope}`} column="Cơ sở (Nguồn / doanh thu)" unit="cơ sở" summary={stores} filename={`doanh-thu-co-so-${from}-${to}.csv`} loading={summaryLoading} error={contractsError}/>
    <div className="mg-source-sales-heading mg-source-sales-heading-sub"><div><h2>Theo NVKD / TLS được phân công</h2></div></div>
    <div className="mg-sales-filter-row"><div className="mg-sales-segmented" role="group" aria-label="Bộ phận báo cáo bổ sung">{DEPARTMENTS.map(item=><button key={item.value||'all'} type="button" aria-pressed={department===item.value} onClick={()=>setDepartment(item.value)}>{item.label}</button>)}</div><button className="mg-button" type="button" disabled={loading||!rows.length} onClick={exportCsv}><ArrowDownToLine size={16}/>Xuất báo cáo bổ sung</button></div>
    {loading ? <p role="status" className="mg-table-state">Đang tải doanh số…</p> : error ? <p role="alert" className="mg-field-error">{error}</p> : <><ul className="mg-sales-cards">{rows.map(row=><li key={`${row.department}-${row.staff_id}-${row.name}`}><strong>{row.name} · {row.department}</strong><b>{money(row.revenue)}</b><span>{row.department === 'NVKD' ? 'Tiền thuê thực thu, gồm gia hạn' : 'Tiền thuê HĐ mở mới đầu tiên'}</span><span>{row.contracts} hợp đồng · {row.customers} khách · {row.new_customers} khách mới</span></li>)}</ul>{!rows.length && <p className="mg-table-state">Chưa có doanh số được gắn nhân viên trong kỳ.</p>}</>}
    </>}
    </details></div>
  </div></section>;
}
