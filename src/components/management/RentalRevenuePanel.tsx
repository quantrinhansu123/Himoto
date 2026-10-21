'use client';
import {useEffect,useState} from 'react';
import {ArrowDownToLine} from 'lucide-react';
import {loadRentalRevenue,type RentalRevenueReport} from '@/lib/management/rental-revenue';
import {formatMoney} from '@/lib/formatters';
import {csvCell} from '@/lib/management/table-utils';
const labels=[['rental','Phí thuê đã thu'],['renewal','Gia hạn đã thu'],['late','Trả muộn đã thu'],['early','Đã hoàn do trả sớm']] as const;
export function RentalRevenuePanel({from,to,store,retry}:{from:string;to:string;store:string;retry:number}){
  const [report,setReport]=useState<RentalRevenueReport|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[view,setView]=useState<'days'|'staff'>('days');
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');
    loadRentalRevenue(from,to,store,controller.signal).then(value=>{if(!controller.signal.aborted)setReport(value);}).catch(cause=>{if(!controller.signal.aborted){setReport(null);setError(cause instanceof Error?cause.message:'Không tải được doanh thu.');}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[from,to,store,retry]);
  const ready=!loading&&!error&&report,rows=report?.[view]||[];
  const name=(key:string)=>view==='days'?key.split('-').reverse().join('/'):key;
  function exportCsv(){
    if(!ready)return;
    const data=[[view==='days'?'Ngày thu / hoàn tiền':'NVKD ghi nhận doanh số',...labels.map(([,label])=>label),'Doanh thu thuê xe'],...rows.map(row=>[name(row.name),...labels.map(([key])=>row[key]),row.revenue]),['Tổng',...labels.map(([key])=>report!.total[key]),report!.total.revenue]];
    const url=URL.createObjectURL(new Blob(['\uFEFF',data.map(row=>row.map(value=>csvCell(String(value))).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`doanh-thu-thue-xe-${view}-${from}-${to}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className="mg-rental-revenue mg-data-panel" aria-label="Doanh thu thuê xe thực thu" aria-busy={loading}>
    <div className="mg-rental-revenue-heading"><div><h2>Doanh thu thuê xe</h2><p>Theo ngày thực thu / thực hoàn tiền · Chưa trừ chi phí</p></div><strong data-revenue-total>{ready?formatMoney(report!.total.revenue):'—'}</strong></div>
    <dl className="mg-rental-revenue-formula">{labels.map(([key,label])=><div key={key}><dt>{key==='early'?'− ':'+ '}{label}</dt><dd data-revenue={key}>{ready?formatMoney(report!.total[key]):'—'}</dd></div>)}</dl>
    <p className="mg-rental-revenue-note">Doanh thu = Phí thuê + Gia hạn + Trả muộn − Hoàn tiền thuê trả sớm. Không gồm cọc, hoàn cọc, phí sửa chữa và khoản thu khác. Gia hạn chưa thu tiền chưa tính doanh thu.</p>
    <div className="mg-rental-revenue-toolbar"><div role="group" aria-label="Xem doanh thu theo"><button type="button" className={`mg-button${view==='days'?' is-active':''}`} aria-pressed={view==='days'} onClick={()=>setView('days')}>Theo ngày</button><button type="button" className={`mg-button${view==='staff'?' is-active':''}`} aria-pressed={view==='staff'} onClick={()=>setView('staff')}>Theo NVKD</button></div><button type="button" className="mg-button" disabled={!ready||!rows.length} onClick={exportCsv}><ArrowDownToLine size={15}/>Xuất Excel (CSV)</button></div>
    {loading?<p className="mg-table-state" role="status">Đang tải doanh thu…</p>:error?<p className="mg-field-error" role="alert">{error}</p>:<>
      {report!.unclassified_count>0&&<p className="mg-rental-revenue-note is-incomplete" role="status">Có {report!.unclassified_count} phiếu chưa xác định được loại thu / chi ({formatMoney(report!.unclassified_amount)}). Chưa cộng vào doanh thu; cần đối chiếu Sổ quỹ trước khi chốt KPI.</p>}
      <div className="mg-table-scroll" role="region" aria-label="Chi tiết doanh thu thuê xe" tabIndex={0}><table className="mg-table mg-rental-revenue-table"><thead><tr><th scope="col">{view==='days'?'Ngày thu / hoàn tiền':'NVKD ghi nhận doanh số'}</th>{labels.map(([key,label])=><th scope="col" className="mg-align-right" key={key}>{label}</th>)}<th scope="col" className="mg-align-right">Doanh thu</th></tr></thead>
        <tbody>{rows.map(row=><tr key={row.key}><th scope="row">{name(row.name)}</th>{labels.map(([key])=><td className="mg-align-right" key={key}>{formatMoney(row[key])}</td>)}<td className="mg-align-right"><strong>{formatMoney(row.revenue)}</strong></td></tr>)}{!rows.length&&<tr><td colSpan={6}>Chưa có khoản thu hoặc hoàn tiền thuê trong kỳ.</td></tr>}</tbody>
        <tfoot><tr><th scope="row">Tổng</th>{labels.map(([key])=><td className="mg-align-right" key={key}>{formatMoney(report!.total[key])}</td>)}<td className="mg-align-right"><strong>{formatMoney(report!.total.revenue)}</strong></td></tr></tfoot>
      </table></div>
    </>}
  </section>;
}
