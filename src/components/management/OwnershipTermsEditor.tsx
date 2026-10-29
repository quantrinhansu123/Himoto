'use client';

import { useEffect,useRef,useState } from 'react';
import { LoaderCircle,Pencil,RotateCcw,Save } from 'lucide-react';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';
import { OWNERSHIP_TERMS,type OwnershipTerm } from '@/lib/management/contract-billing';
import { canEditOwnershipTerms,loadOwnershipTerms,saveOwnershipTerms,OwnershipTermsRequestError,type OwnershipTermsInput,type OwnershipTermsState } from '@/lib/management/ownership-terms';
import { formatDateTime,formatMoney } from '@/lib/formatters';

const termLabel=(term:OwnershipTerm)=>OWNERSHIP_TERMS.find(option=>option.value===term)?.label||'Chưa phân loại';
const dailyLabel=(amount:number|null)=>amount===null?'Chưa xác định':`${formatMoney(amount)} / ngày`;
export function OwnershipTermsSummary({id,revision}:{id:number;revision:unknown}) {
  const [data,setData]=useState<OwnershipTermsState|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setData(null);setError('');
    void loadOwnershipTerms(id,controller.signal).then(value=>{if(!controller.signal.aborted)setData(value);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được thông tin thuê sở hữu.');});
    return()=>controller.abort();
  },[id,revision,retry]);
  if(error)return <p className="mg-field-error" role="alert">{error} <button type="button" className="mg-button" onClick={()=>setRetry(value=>value+1)}>Tải lại thời hạn và mức đóng</button></p>;
  if(!data)return <p role="status">Đang tải thời hạn và mức đóng thuê sở hữu…</p>;
  return <dl className="mg-contract-detail-grid"><div><dt>Thời hạn sở hữu</dt><dd>{termLabel(data.term_months)}</dd></div><div><dt>Số tiền đóng mỗi ngày</dt><dd>{dailyLabel(data.daily_amount)}</dd></div></dl>;
}
export function OwnershipTermsEditor({id,code,onSaved,startOpen=false,onClose}:{id:number;code:string;onSaved?:(value:OwnershipTermsState)=>void;startOpen?:boolean;onClose?:()=>void}) {
  const {accessUser,invalidateData,notify}=useManagement();
  const [open,setOpen]=useState(startOpen),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const [data,setData]=useState<OwnershipTermsState|null>(null),[term,setTerm]=useState<OwnershipTerm>('custom'),[daily,setDaily]=useState(''),[retry,setRetry]=useState(0),[uncertain,setUncertain]=useState(false);
  const pending=useRef<OwnershipTermsInput|null>(null),busy=useRef(false);
  const allowed=canEditOwnershipTerms(accessUser);
  function close(){if(saving)return;setOpen(false);onClose?.();}
  useEffect(()=>{if(startOpen&&!allowed)onClose?.();},[startOpen,allowed,onClose]);
  useEffect(()=>{
    if(!open||!allowed)return;
    const controller=new AbortController();setLoading(true);setError('');setData(null);
    void loadOwnershipTerms(id,controller.signal).then(value=>{if(controller.signal.aborted)return;setData(value);setTerm(value.term_months);setDaily(value.daily_amount===null?'':String(value.daily_amount));pending.current=null;setUncertain(false);})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được thông tin thuê sở hữu.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[id,open,allowed,retry]);
  if(!allowed)return null;
  async function save(event:React.FormEvent) {
    event.preventDefault();if(!data?.can_edit||busy.current||loading)return;
    if(!pending.current){
      if(daily&&!/^[1-9]\d{0,12}$/.test(daily))return setError('Nhập số tiền mỗi ngày là số nguyên VNĐ lớn hơn 0; để trống nếu chưa xác định.');
      pending.current={revision:data.revision,request_id:crypto.randomUUID(),term_months:term,daily_amount:daily||null};
    }
    busy.current=true;setSaving(true);setError('');
    try {
      const value=await saveOwnershipTerms(id,pending.current);pending.current=null;setUncertain(false);setData(value);setOpen(false);onClose?.();
      invalidateData(['contracts']);notify(`Đã lưu thời hạn và mức đóng hằng ngày của HĐ ${value.code}.`);onSaved?.(value);
    }catch(cause){
      if(cause instanceof OwnershipTermsRequestError&&cause.status>=400&&cause.status<500){pending.current=null;setUncertain(false);}
      else setUncertain(true);
      setError(cause instanceof Error?cause.message:'Chưa xác nhận được kết quả lưu. Tải lại để kiểm tra.');
    }finally{busy.current=false;setSaving(false);}
  }
  return <>{!startOpen&&<button type="button" className="mg-button" onClick={()=>setOpen(true)}><Pencil size={16}/>Sửa thời hạn / mức đóng</button>}
    {open&&<Dialog title={`Thời hạn & mức đóng thuê sở hữu · ${code}`} onClose={close}>
      <form onSubmit={save}><div className="mg-dialog-body">
        <p>Bổ sung thông tin đúng của hợp đồng cũ để theo dõi. Thời hạn này là phân loại sở hữu; các kỳ thuê, khoản phải thu và phiếu thu / chi đã ghi giữ nguyên.</p>
        {loading&&<p role="status"><LoaderCircle size={16} className="mg-spin"/> Đang tải thời hạn và mức đóng…</p>}
        {!loading&&data&&<>
          {!data.can_edit&&<p role="status">Hợp đồng này chưa phát hành hoặc đã hủy, không thể cập nhật ở đây.</p>}
          <fieldset className="mg-form-grid" disabled={saving||uncertain||!data.can_edit}>
            <div className="mg-field"><label htmlFor="ownership-correct-term">Thời hạn thuê sở hữu</label><select id="ownership-correct-term" value={term} onChange={event=>setTerm(event.target.value as OwnershipTerm)}>{OWNERSHIP_TERMS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
            <div className="mg-field"><label htmlFor="ownership-correct-daily">Số tiền đóng mỗi ngày (VNĐ)</label><input id="ownership-correct-daily" inputMode="numeric" autoComplete="off" value={daily.replace(/\B(?=(\d{3})+(?!\d))/g,'.')} onChange={event=>setDaily(event.target.value.replace(/[.\s,]/g,''))} aria-describedby="ownership-correct-daily-help"/><small id="ownership-correct-daily-help">Mức đóng cho toàn bộ xe của hợp đồng trong một ngày. Để trống nếu chưa xác định.</small></div>
          </fieldset>
          {data.history.length>0&&<details><summary>Lịch sử sửa thời hạn và mức đóng ({data.history.length})</summary><ul>{data.history.map((edit,index)=><li key={index}><strong>{formatDateTime(edit.at)} · {edit.actor}</strong><p>Thời hạn: {termLabel(edit.before.term_months)} → {termLabel(edit.after.term_months)}<br/>Mức đóng: {dailyLabel(edit.before.daily_amount)} → {dailyLabel(edit.after.daily_amount)}</p></li>)}</ul></details>}
        </>}
        {uncertain&&<p role="status">Chưa xác nhận được kết quả lưu. Bấm Lưu để kiểm tra lại kết quả, hoặc Tải lại dữ liệu.</p>}
        {error&&<p className="mg-field-error" role="alert">{error}</p>}
      </div><div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving||loading} onClick={()=>setRetry(value=>value+1)}><RotateCcw size={16}/>Tải lại</button><button type="button" className="mg-button" disabled={saving} onClick={close}>Đóng</button><button type="submit" className="mg-button mg-button-primary" disabled={saving||loading||!data?.can_edit}>{saving?<LoaderCircle size={16} className="mg-spin"/>:<Save size={16}/>}Lưu thời hạn và mức đóng</button></div></form>
    </Dialog>}
  </>;
}
