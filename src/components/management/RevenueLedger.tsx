'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {ArrowDownToLine,ChevronLeft,ChevronRight,LoaderCircle,ReceiptText,Search} from 'lucide-react';
import {formatMoney} from '@/lib/formatters';
import {loadRevenueLedger,REVENUE_LEDGER_CATEGORIES,REVENUE_LEDGER_METHODS,type RevenueLedgerMethod,type RevenueLedgerReport,type RevenueLedgerRow} from '@/lib/management/revenue-ledger';

const day=(value:string)=>value.split('-').reverse().join('/');
const time=(value:string)=>new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
const signed=(row:RevenueLedgerRow)=>row.type==='out'?-row.amount:row.amount;
const methodAmount=(row:RevenueLedgerRow,method:RevenueLedgerMethod|'other')=>(method==='other'?['mixed','unknown'].includes(row.method):row.method===method)?signed(row):0;
const methodTotal=(report:RevenueLedgerReport,method:RevenueLedgerMethod|'other')=>method==='other'
 ?report.totals.methods.mixed.income-report.totals.methods.mixed.expense+report.totals.methods.unknown.income-report.totals.methods.unknown.expense
 :report.totals.methods[method].income-report.totals.methods[method].expense;
const moneyCell=(value:number)=>value===0?'—':formatMoney(value);
const methodColumns=[['cash','Tiền mặt'],['personal','TK cá nhân'],['company','TK công ty'],['other','Chưa tách / chưa rõ']] as const;

export function RevenueLedger({from,to,store,retry}:{from:string;to:string;store:string;retry:number}) {
 const [data,setData]=useState<RevenueLedgerReport|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [search,setSearch]=useState(''),[category,setCategory]=useState(''),[method,setMethod]=useState(''),[page,setPage]=useState(1),[size,setSize]=useState(20),[refresh,setRefresh]=useState(0),[exporting,setExporting]=useState(false),[exportError,setExportError]=useState('');
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');setData(null);setExportError('');
  const timer=setTimeout(()=>{void loadRevenueLedger({from,to,store,search,category,method,page,size},controller.signal)
   .then(value=>{if(!controller.signal.aborted)setData(value);})
   .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được sổ giao dịch.');})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});},250);
  return()=>{clearTimeout(timer);controller.abort();};
 },[from,to,store,search,category,method,page,size,retry,refresh]);
 const ready=!loading&&!error&&data;
 async function exportExcel(){
  if(!ready||exporting)return;setExporting(true);setExportError('');
  try{
   const report=await loadRevenueLedger({from,to,store,search,category,method,page:1,size},undefined,true);
   const ExcelJS=await import('exceljs'),book=new ExcelJS.Workbook();book.creator='HIMOTO';
   const sheet=book.addWorksheet('Sổ giao dịch',{views:[{state:'frozen',ySplit:4,xSplit:3,showGridLines:false}]});
   sheet.columns=[{width:15},{width:13},{width:10},{width:14},{width:30},{width:24},{width:22},{width:22},{width:20},{width:20},{width:20},{width:22},{width:20},{width:28},{width:28},{width:48}];
   sheet.mergeCells('A1:P1');sheet.getCell('A1').value='HIMOTO · SỔ GIAO DỊCH THUÊ XE';sheet.getRow(1).height=34;sheet.getCell('A1').font={name:'Calibri',size:18,bold:true,color:{argb:'FFFFFF'}};sheet.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:'17212F'}};
   sheet.mergeCells('A2:P2');sheet.getCell('A2').value=`${day(from)} – ${day(to)} · ${report.total} phiếu · ${report.totals.contracts} hợp đồng · Phiếu đã duyệt · Giờ Việt Nam`;sheet.getRow(2).height=26;
   sheet.mergeCells('A3:P3');sheet.getCell('A3').value='Các cột hình thức thanh toán là thu (+) / chi (−). Cọc và hoàn cọc không tính doanh thu. Một hợp đồng có thể có nhiều phiếu.';sheet.getRow(3).height=25;
   sheet.getRow(4).values=['Mã phiếu','Ngày','Giờ','Hợp đồng','Khách hàng','Biển số','Cơ sở','Nghiệp vụ','Tiền mặt','TK cá nhân','TK công ty','Chưa tách / chưa rõ','Tính doanh thu','NVKD','Người ghi nhận','Ghi chú'];sheet.getRow(4).height=28;
   sheet.getRow(4).eachCell(cell=>{cell.font={name:'Calibri',size:11,bold:true,color:{argb:'FFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'D82232'}};cell.alignment={vertical:'middle',wrapText:true};});
   for(const row of report.rows){const line=sheet.addRow([`#${row.id}`,day(row.day),time(row.at),row.code,row.customer,row.vehicles,row.store_name,REVENUE_LEDGER_CATEGORIES[row.category],...methodColumns.map(([key])=>methodAmount(row,key)),row.revenue,row.staff_name,row.actor_name,row.note]);line.height=30;line.eachCell((cell,column)=>{cell.font={name:'Calibri',size:11};cell.alignment={vertical:'middle',wrapText:true};if(line.number%2)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'F1F5F9'}};if(column>=9&&column<=13){cell.numFmt='#,##0;[Red](#,##0);"—"';cell.alignment={vertical:'middle',horizontal:'right'};}});}
   const total=sheet.addRow(['TỔNG TOÀN BỘ KẾT QUẢ',report.total+' phiếu','','','','','',report.totals.contracts+' hợp đồng',...methodColumns.map(([key])=>methodTotal(report,key)),report.totals.revenue]);total.height=30;total.eachCell((cell,column)=>{cell.font={name:'Calibri',size:11,bold:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'E2E8F0'}};if(column>=9&&column<=13)cell.numFmt='#,##0;[Red](#,##0);"—"';});
   sheet.autoFilter=`A4:P${4+report.rows.length}`;sheet.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:4'};
   const buffer=await book.xlsx.writeBuffer();const url=URL.createObjectURL(new Blob([new Uint8Array(buffer)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
   const link=document.createElement('a');link.href=url;link.download=`HIMOTO-so-giao-dich-${from}-${to}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(cause){setExportError(cause instanceof Error?cause.message:'Không xuất được sổ giao dịch.');}finally{setExporting(false);}
 }
 return <section className="mg-revenue-ledger" aria-label="Sổ giao dịch từng phiếu" aria-busy={loading}>
  <div className="mg-revenue-ledger-heading"><div><h3><ReceiptText size={19} aria-hidden="true"/>Sổ giao dịch <span>{ready?data.total.toLocaleString('vi-VN'):'—'} phiếu</span></h3><p>Mỗi dòng là một phiếu thu / chi đã duyệt. Xem mã phiếu để đối chiếu từng khoản với sổ.</p></div><button type="button" className="mg-button" disabled={!ready||!data.total||exporting} onClick={()=>void exportExcel()}>{exporting?<LoaderCircle size={16} className="mg-spin"/>:<ArrowDownToLine size={16}/>} {exporting?'Đang xuất…':'Xuất sổ Excel'}</button></div>
  <div className="mg-revenue-ledger-filters"><label className="mg-report-search"><Search size={16} aria-hidden="true"/><input type="search" aria-label="Tìm giao dịch" placeholder="Khách, mã HĐ, biển số, mã phiếu…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label>
   <label><span>Nghiệp vụ</span><select aria-label="Lọc nghiệp vụ giao dịch" value={category} onChange={e=>{setCategory(e.target.value);setPage(1);}}><option value="">Tất cả thu / chi</option><option value="revenue">Chỉ phiếu tính doanh thu</option>{Object.entries(REVENUE_LEDGER_CATEGORIES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <label><span>Hình thức thanh toán</span><select aria-label="Lọc hình thức giao dịch" value={method} onChange={e=>{setMethod(e.target.value);setPage(1);}}><option value="">Tất cả hình thức</option>{Object.entries(REVENUE_LEDGER_METHODS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   {(search||category||method)&&<button type="button" className="mg-button" onClick={()=>{setSearch('');setCategory('');setMethod('');setPage(1);}}>Xóa bộ lọc giao dịch</button>}
  </div>
  {loading?<p role="status" className="mg-table-state">Đang tải từng phiếu giao dịch…</p>:error?<div className="mg-revenue-ledger-error"><p role="alert" className="mg-field-error">{error}</p><button type="button" className="mg-button" onClick={()=>setRefresh(v=>v+1)}>Thử tải lại sổ</button></div>:data&&<>
   <dl className="mg-revenue-ledger-metrics" aria-label="Tổng giao dịch theo bộ lọc"><div><dt>Phiếu thu</dt><dd>{formatMoney(data.totals.income)}</dd><small>{data.totals.income_count} phiếu · gồm {formatMoney(data.totals.deposit)} cọc</small></div><div><dt>Phiếu chi</dt><dd>{formatMoney(data.totals.expense)}</dd><small>{data.totals.expense_count} phiếu · gồm {formatMoney(data.totals.deposit_refund)} hoàn cọc</small></div><div><dt>Tính vào doanh thu</dt><dd data-ledger-revenue>{formatMoney(data.totals.revenue)}</dd><small>{data.totals.revenue_count} phiếu · {data.totals.contracts} hợp đồng có giao dịch</small></div></dl>
   <div className="mg-revenue-ledger-methods"><p>Doanh thu theo hình thức thanh toán</p><dl>{methodColumns.map(([key,label])=><div key={key}><dt>{label}</dt><dd data-ledger-method={key}>{formatMoney(key==='other'?data.totals.methods.mixed.revenue+data.totals.methods.unknown.revenue:data.totals.methods[key].revenue)}</dd></div>)}</dl></div>
   <p className="mg-revenue-ledger-help">Cột hình thức thanh toán: thu (+), chi (−). Cột Doanh thu tách cọc, hoàn cọc và khoản ngoài tiền thuê. Dòng tổng tính toàn bộ kết quả lọc, kể cả các trang sau.</p>
   <div className="mg-table-scroll mg-revenue-ledger-scroll" role="region" tabIndex={0} aria-label="Bảng từng phiếu thu chi"><table className="mg-table mg-revenue-ledger-table"><thead><tr><th scope="col">Phiếu / Thời gian</th><th scope="col">Khách hàng / Hợp đồng</th><th scope="col">Nghiệp vụ</th>{methodColumns.map(([key,label])=><th scope="col" className="mg-align-right" key={key}>{label}</th>)}<th scope="col" className="mg-align-right">Doanh thu</th></tr></thead>
    <tbody>{data.rows.map(row=><tr key={row.id}><th scope="row"><span className={`mg-ledger-type${row.type==='out'?' is-expense':''}`}>{row.type==='out'?'Chi':'Thu'} #{row.id}</span><time dateTime={row.at}>{time(row.at)} · {day(row.day)}</time></th><td><strong className="mg-ledger-customer">{row.customer||'Chưa ghi nhận khách'}</strong><Link href={`/contracts?contract_id=${row.order_id}`} className="mg-ledger-contract">HĐ {row.code}</Link>{row.vehicles&&<small>{row.vehicles}</small>}<details className="mg-ledger-row-details"><summary>Thông tin phiếu</summary><dl><div><dt>Cơ sở</dt><dd>{row.store_name||'Chưa ghi nhận'}</dd></div><div><dt>NVKD</dt><dd>{row.staff_name||'Chưa phân công'}</dd></div><div><dt>Người ghi nhận</dt><dd>{row.actor_name||'Chưa ghi nhận'}</dd></div><div><dt>Ghi chú</dt><dd>{row.note||'—'}</dd></div></dl></details></td><td><span>{REVENUE_LEDGER_CATEGORIES[row.category]}</span><small>{REVENUE_LEDGER_METHODS[row.method]}</small>{row.revenue===0&&<small className="mg-ledger-excluded">Không tính doanh thu</small>}{row.category==='rental'&&row.revenue!==row.amount&&<small>Đã tách phí ngoài tiền thuê</small>}</td>{methodColumns.map(([key])=><td key={key} className={`mg-align-right${row.type==='out'&&methodAmount(row,key)?' is-expense':''}`}>{moneyCell(methodAmount(row,key))}</td>)}<td className={`mg-align-right mg-ledger-row-revenue${row.revenue<0?' is-expense':''}`}>{moneyCell(row.revenue)}</td></tr>)}{!data.rows.length&&<tr><td colSpan={8}>Không có giao dịch khớp bộ lọc trong kỳ.</td></tr>}</tbody>
    <tfoot><tr><th scope="row" colSpan={3}>Tổng {data.total} phiếu · Toàn bộ kết quả lọc</th>{methodColumns.map(([key])=><td className="mg-align-right" key={key}>{formatMoney(methodTotal(data,key))}</td>)}<td className="mg-align-right">{formatMoney(data.totals.revenue)}</td></tr></tfoot>
   </table></div>
   <div className="mg-revenue-ledger-pagination"><label>Hiển thị <select aria-label="Số phiếu mỗi trang" value={size} onChange={e=>{setSize(Number(e.target.value));setPage(1);}}>{[20,50,100].map(n=><option key={n} value={n}>{n} phiếu</option>)}</select></label><span role="status">{data.total?`${(data.page-1)*data.page_size+1}–${(data.page-1)*data.page_size+data.rows.length}`:'0'} / {data.total} phiếu</span><div><button type="button" className="mg-button" aria-label="Trang giao dịch trước" disabled={data.page<=1} onClick={()=>setPage(data.page-1)}><ChevronLeft size={17}/></button><span>Trang {data.page}/{data.pages}</span><button type="button" className="mg-button" aria-label="Trang giao dịch sau" disabled={data.page>=data.pages} onClick={()=>setPage(data.page+1)}><ChevronRight size={17}/></button></div></div>
  </>}
  {exportError&&<p role="alert" className="mg-field-error">{exportError}</p>}
 </section>;
}
