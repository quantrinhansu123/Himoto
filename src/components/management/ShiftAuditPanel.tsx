'use client';
import { useEffect,useRef,useState } from 'react';
import { useManagement } from './ManagementProvider';
import { ShiftEvidence } from './ShiftEvidence';
import { SHIFT_PHOTOS,type ShiftReport } from '@/lib/management/shift-reports';
import { emptyAuditInput,parseAuditInput,auditComparisons,validateAuditConfirmation,auditReportText,type AuditInput,type AuditKey,type ShiftAudit,type ShiftSnapshot } from '@/lib/management/shift-audits';
import { shiftApi,UnconfirmedSaveError,uploadShiftEvidence,type PendingShiftFile,type ShiftUpload } from '@/lib/management/shift-report-client';
const number=(n:number|null,currency=false)=>n===null?'Chưa có':new Intl.NumberFormat('vi-VN').format(n)+(currency?' đ':'');
type Plan={input:AuditInput;status:'draft'|'confirmed';fingerprint:string;revision:number;key:string;uploads:ShiftUpload[]};
export function ShiftAuditPanel({report,onDirty,onBusy,onSaved}:{report:ShiftReport;onDirty:(value:boolean)=>void;onBusy:(value:boolean)=>void;onSaved:()=>void}){
  const {can,notify}=useManagement();
  const [input,setInput]=useState<AuditInput>(()=>report.audit?.input||emptyAuditInput());
  const [audit,setAudit]=useState<ShiftAudit|null>(report.audit||null),[snapshot,setSnapshot]=useState<ShiftSnapshot|null>(report.audit?.snapshot||null);
  const [media,setMedia]=useState(report.media||[]),[reportRevision,setReportRevision]=useState(report.revision);
  const [pending,setPending]=useState<Record<string,PendingShiftFile>>({}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(!snapshot),[uncertain,setUncertain]=useState(false);
  const locked=!can('shift.review')||audit?.status==='confirmed';
  const plan=useRef<Plan|null>(null),saving=useRef(false),deleting=useRef<{file:typeof media[number];key:string;revision:number}|null>(null);
  useEffect(()=>{
    if(report.audit)return;
    const controller=new AbortController();
    shiftApi<ShiftSnapshot>(`/api/auth/shift-reports/${report.id}/audit`,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setSnapshot(value);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[report.id,report.audit]);
  function change(next:AuditInput){setInput(next);onDirty(true);}
  async function refresh(){if(saving.current)return;setLoading(true);setError('');try{setSnapshot(await shiftApi(`/api/auth/shift-reports/${report.id}/audit`));onDirty(true);}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
  async function remove(file:typeof media[number]){
    if(saving.current)return;
    if(!deleting.current&&!window.confirm('Xóa minh chứng KTNB này?'))return;
    deleting.current??={file,key:crypto.randomUUID(),revision:reportRevision};
    saving.current=true;setBusy(true);onBusy(true);onDirty(true);setError('');
    try{
      const item=deleting.current;
      const result=await shiftApi<{revision:number}>(item.file.url,{method:'DELETE',headers:{'x-shift-request-id':item.key,'x-report-revision':String(item.revision),'x-shift-category':item.file.category,'x-shift-stage':'audit'}});
      setReportRevision(result.revision);setMedia(current=>current.filter(m=>m.id!==item.file.id));deleting.current=null;setUncertain(false);
    }catch(e){const unknown=e instanceof UnconfirmedSaveError;setUncertain(unknown);if(!unknown)deleting.current=null;setError((e as Error).message);}
    finally{saving.current=false;setBusy(false);onBusy(false);}
  }
  async function save(confirm:boolean){
    if(saving.current||!snapshot)return;
    if(deleting.current){await remove(deleting.current.file);return;}
    setError('');
    if(!plan.current){
      try{const checked=parseAuditInput(input);if(confirm)validateAuditConfirmation(report.payload,checked,snapshot);}
      catch(e){setError((e as Error).message);return;}
      if(confirm&&!window.confirm('Xác nhận đối soát KTNB? Số PGD và kết quả đối soát sẽ được giữ nguyên sau khi xác nhận.'))return;
      plan.current={input,status:confirm?'confirmed':'draft',revision:audit?.revision||0,fingerprint:snapshot.fingerprint,key:crypto.randomUUID(),
        uploads:Object.entries(pending).map(([key,item])=>({key,slot:item.category,file:item.file,saved:false}))};
    }
    const work=plan.current;saving.current=true;setBusy(true);onBusy(true);onDirty(true);
    let revision=reportRevision;
    try{
      for(const item of work.uploads){if(item.saved)continue;const result=await uploadShiftEvidence(report.id,revision,'audit',item);revision=result.revision;setReportRevision(revision);item.saved=true;setMedia(current=>[...current,result.media]);setPending(current=>{const next={...current};delete next[item.key];return next;});}
      const saved=await shiftApi<{revision:number;audit:ShiftAudit}>(`/api/auth/shift-reports/${report.id}/audit`,{method:'POST',headers:{'Content-Type':'application/json','x-shift-request-id':work.key},body:JSON.stringify({input:work.input,status:work.status,revision:work.revision,report_revision:revision,fingerprint:work.fingerprint})});
      setAudit(saved.audit);plan.current=null;setUncertain(false);onDirty(false);onSaved();notify(work.status==='confirmed'?'Đã xác nhận đối soát KTNB.':'Đã lưu nháp đối soát KTNB.');
    }catch(e){const unknown=e instanceof UnconfirmedSaveError;if(!unknown)plan.current=null;setUncertain(unknown);setError((e as Error).message+(unknown?' Dữ liệu đang được giữ nguyên. Bấm Thử lại đối soát.':''));}
    finally{saving.current=false;setBusy(false);onBusy(false);}
  }
  const rows=snapshot?auditComparisons(report.payload,input,snapshot):[];
  const setValue=(group:'book'|'actual',key:AuditKey,value:string)=>change({...input,[group]:{...input[group],[key]:value===''?null:Number(value)}});
  const explain=(key:AuditKey|'assets_total'|'transfers',value:string)=>change({...input,explanations:{...input.explanations,[key]:value}});
  return <section className="mg-data-panel shift-form shift-audit" aria-label="KTNB đối soát báo cáo"><div className="shift-audit-heading"><div><div className="mg-eyebrow">BƯỚC 2 · KIỂM TOÁN NỘI BỘ</div><h2>Đối soát {report.store_name} · {report.payload.date.split('-').reverse().join('/')}</h2><p>Bản PGD đã chốt được giữ nguyên. Nhập số sổ và số KTNB kiểm tra độc lập.</p></div><span className={'shift-badge '+(audit?.status==='confirmed'?'is-confirmed':'')}>{audit?.status==='confirmed'?(audit.result==='matched'?'Đã xác nhận · Khớp':'Đã xác nhận · Có giải trình'):'Chờ KTNB xác nhận'}</span></div>
    {audit&&<p>Người đối soát: <strong>{audit.reviewer_name}</strong> · {new Date(audit.confirmed_at||audit.updated_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</p>}
    {audit&&<details><summary>Nội dung báo cáo KTNB để gửi / lưu</summary><pre className="shift-report-text">{auditReportText(report.store_name,report.payload.date,audit,report.payload)}</pre><button type="button" className="mg-button" onClick={()=>void navigator.clipboard.writeText(auditReportText(report.store_name,report.payload.date,audit,report.payload)).then(()=>notify('Đã chép báo cáo KTNB.')).catch(()=>setError('Không chép được. Chọn nội dung báo cáo và sao chép thủ công.'))}>Chép báo cáo KTNB</button></details>}
    {!locked&&<button type="button" className="mg-button" disabled={busy||loading||uncertain} onClick={()=>void refresh()}>{loading?'Đang lấy số liệu…':'Lấy lại số liệu app'}</button>}
    {snapshot&&<><p>Số app lấy lúc {new Date(snapshot.captured_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}. Doanh thu = thuê + gia hạn + trả muộn − hoàn tiền thuê trả sớm, theo ngày thu/hoàn thực tế; tách tiền cọc.</p><details><summary>Nguồn số liệu app</summary><p>{snapshot.inventory_note}</p><p>{snapshot.accounts_note}</p><p>{snapshot.unclassified_count} giao dịch trong tháng chưa phân loại doanh thu.</p></details></>}
    <fieldset disabled={locked||busy||uncertain||loading}>
    <div className="shift-table-scroll"><table className="shift-comparison"><thead><tr><th>Khoản đối soát</th><th>PGD đã chốt</th><th>App</th><th>Sổ theo dõi</th><th>KTNB kiểm tra</th><th>Kết quả</th></tr></thead><tbody>{rows.map(row=><tr key={row.key} className={row.different?'has-difference':''}><th scope="row">{row.label}</th><td data-label="PGD">{number(row.pgd,row.currency)}</td><td data-label="App">{number(row.app,row.currency)}</td><td data-label="Sổ">{row.key==='assets_total'?number(row.book):<input type="number" step="1" aria-label={'Sổ · '+row.label} value={input.book[row.key]??''} onChange={e=>setValue('book',row.key as AuditKey,e.target.value)}/>}</td><td data-label="KTNB">{row.key==='assets_total'?number(row.actual):<input type="number" step="1" aria-label={'KTNB · '+row.label} value={input.actual[row.key]??''} onChange={e=>setValue('actual',row.key as AuditKey,e.target.value)}/>}</td><td data-label="Kết quả"><strong className={row.different?'shift-difference':''}>{row.missing?'Chưa đủ số':row.different?'Có chênh lệch':row.unavailable?'Thiếu nguồn app':'Khớp các nguồn đã có'}</strong>{row.delta!==null&&row.delta!==0&&<small>KTNB − Sổ: {number(row.delta,row.currency)}</small>}
      {row.delta_pgd!==null&&row.delta_pgd!==0&&<small>KTNB − PGD: {number(row.delta_pgd,row.currency)}</small>}
      {row.delta_app!==null&&row.delta_app!==0&&<small>KTNB − App: {number(row.delta_app,row.currency)}</small>}
      {(row.different||row.unavailable||input.explanations[row.key])&&<textarea aria-label={'Giải trình · '+row.label} placeholder="Nguyên nhân và kết quả kiểm tra" maxLength={3000} value={input.explanations[row.key]||''} onChange={e=>explain(row.key,e.target.value)}/>}</td></tr>)}</tbody></table></div>
    <h3>Xe giữ bên ngoài</h3><p>Ghi từng biển số và lý do, ví dụ xe CA giữ. Số xe này được cộng vào tổng tài sản, tách xe thực tế tại PGD.</p>
    {input.external.map((item,index)=><div className="shift-edit-row" key={index}><input aria-label={`Biển số xe ngoài ${index+1}`} placeholder="Biển số" value={item.plate} onChange={e=>change({...input,external:input.external.map((v,i)=>i===index?{...v,plate:e.target.value}:v)})}/><input aria-label={`Lý do xe ngoài ${index+1}`} placeholder="Lý do / nơi giữ" value={item.reason} onChange={e=>change({...input,external:input.external.map((v,i)=>i===index?{...v,reason:e.target.value}:v)})}/><button type="button" className="mg-button" onClick={()=>change({...input,external:input.external.filter((_,i)=>i!==index)})}>Bỏ dòng</button></div>)}
    {!locked&&<button type="button" className="mg-button" onClick={()=>change({...input,external:[...input.external,{plate:'',reason:''}]})}>Thêm xe bên ngoài</button>}
    <h3>Điều chuyển trong ngày</h3>{snapshot?.transfers.length?<ul>{snapshot.transfers.map((v,i)=><li key={i}>{v.plate} · {v.from} → {v.to}</li>)}</ul>:<p>App chưa có điều chuyển trong ngày này.</p>}
    {input.transfers.map((item,index)=><div className="shift-edit-row" key={index}>{(['plate','from','to'] as const).map(key=><input key={key} aria-label={`Điều chuyển ${index+1} ${key}`} placeholder={key==='plate'?'Biển số':key==='from'?'Nơi đi':'Nơi đến'} value={item[key]} onChange={e=>change({...input,transfers:input.transfers.map((v,i)=>i===index?{...v,[key]:e.target.value}:v)})}/>)}<button type="button" className="mg-button" onClick={()=>change({...input,transfers:input.transfers.filter((_,i)=>i!==index)})}>Bỏ dòng</button></div>)}
    {!locked&&<button type="button" className="mg-button" onClick={()=>change({...input,transfers:[...input.transfers,{plate:'',from:'',to:''}]})}>Thêm điều chuyển</button>}
    <div className="mg-field"><label htmlFor="audit-transfer-note">Giải trình điều chuyển (nếu khác app)</label><textarea id="audit-transfer-note" value={input.explanations.transfers||''} onChange={e=>explain('transfers',e.target.value)} maxLength={3000}/></div>
    <div className="mg-field"><label htmlFor="audit-notes">Kết luận / ghi chú KTNB</label><textarea id="audit-notes" value={input.notes} onChange={e=>change({...input,notes:e.target.value})} maxLength={5000}/></div>
    <details><summary>Minh chứng KTNB · {media.filter(m=>m.stage==='audit').length} tệp đã lưu · {Object.keys(pending).length} tệp chưa lưu</summary><ShiftEvidence slots={SHIFT_PHOTOS.map(([key])=>key)} media={media.filter(m=>m.stage==='audit')} pending={pending} readonly={locked} disabled={busy||uncertain} onFiles={value=>{setPending(value);onDirty(true);}} onDelete={file=>void remove(file)}/></details>
    </fieldset>
    {error&&<p role="alert" className="mg-field-error">{error}</p>}
    {!locked&&<div className="shift-actions">{uncertain?<button type="button" className="mg-button mg-button-primary" disabled={busy} onClick={()=>void save(false)}>Thử lại đối soát</button>:<><button type="button" className="mg-button" disabled={busy||loading||!snapshot} onClick={()=>void save(false)}>{busy?'Đang lưu…':'Lưu nháp KTNB'}</button><button type="button" className="mg-button mg-button-primary" disabled={busy||loading||!snapshot} onClick={()=>void save(true)}>Xác nhận đối soát</button></>}</div>}
  </section>;
}
