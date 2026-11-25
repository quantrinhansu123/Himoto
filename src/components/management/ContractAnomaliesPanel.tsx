'use client';

import {useEffect,useState} from 'react';
import {formatDateTime,formatMoney} from '@/lib/formatters';

type Row = {transaction_id:string;contract_code:string;employee:string;store:string;occurred_at:string;amount:string;expected_amount:string;transaction_status:string|null};
const fields = [
  {key:'date',label:'Ngày chi',type:'date'},
  {key:'employee',label:'Nhân viên',type:'text'},
  {key:'store',label:'Cơ sở',type:'text'},
  {key:'contract',label:'Hợp đồng',type:'text'},
] as const;

export function ContractAnomaliesPanel() {
  const [open,setOpen] = useState(false);
  const [filters,setFilters] = useState({date:'',employee:'',store:'',contract:''});
  const [page,setPage] = useState(1);
  const [data,setData] = useState<{rows:Row[];hasMore:boolean}|null>(null);
  const [error,setError] = useState('');
  useEffect(()=>{
    if(!open)return;
    const controller = new AbortController();
    setData(null);
    setError('');
    const query = new URLSearchParams({...filters,page:String(page)});
    const timer = setTimeout(()=>{
      void fetch(`/api/auth/order/car-rental/anomalies?${query}`,{cache:'no-store',signal:controller.signal})
        .then(async response=>{
          const body = await response.json();
          if(!response.ok||body.status!=='success')throw new Error(body.message||'Không tải được bất thường hợp đồng.');
          if(!controller.signal.aborted)setData(body.data);
        }).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được bất thường hợp đồng.');});
    },200);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[open,filters,page]);
  return <details className="mg-data-panel" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="mg-button">Bất thường HĐ</summary>
    {open&&<div className="mg-dialog-body">
      <div className="mg-form-grid">{fields.map(field=><label className="mg-field" key={field.key}>{field.label}
        <input type={field.type} value={filters[field.key]} onChange={event=>{setFilters({...filters,[field.key]:event.target.value});setPage(1);}}/>
      </label>)}</div>
      {error?<p role="alert">{error}</p>:!data?<p role="status">Đang tải…</p>:!data.rows.length?<p role="status">Chưa có bất thường trong bộ lọc này.</p>:
        <div className="mg-table-scroll" role="region" aria-label="Bảng bất thường hợp đồng" tabIndex={0}>
          <table className="mg-table"><thead><tr>{['Ngày chi','Nhân viên','Cơ sở','Hợp đồng','Phiếu chi','Đã hoàn','Mức đối chiếu','Vượt mức'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{data.rows.map(row=><tr key={row.transaction_id}><td>{formatDateTime(row.occurred_at)}</td><td>{row.employee}</td><td>{row.store}</td><td>{row.contract_code}</td>
              <td>#{row.transaction_id}{row.transaction_status==='cancelled'?' · Đã hủy':row.transaction_status===null?' · Không còn trên sổ quỹ':''}</td>
              <td>{formatMoney(Number(row.amount))}</td><td>{formatMoney(Number(row.expected_amount))}</td><td>{formatMoney(Number(row.amount)-Number(row.expected_amount))}</td></tr>)}</tbody>
          </table>
        </div>}
      {(page>1||data?.hasMore)&&<div className="mg-page-buttons">
        <button type="button" className="mg-button" disabled={page===1} onClick={()=>setPage(page-1)}>Trang trước</button>
        <span>Trang {page}</span>
        <button type="button" className="mg-button" disabled={!data?.hasMore} onClick={()=>setPage(page+1)}>Trang sau</button>
      </div>}
    </div>}
  </details>;
}
