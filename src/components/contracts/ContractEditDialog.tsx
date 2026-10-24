'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { LoaderCircle, Save } from 'lucide-react';
import { Dialog } from '@/components/management/Dialog';
import { useManagement } from '@/components/management/ManagementProvider';
import { createContractDraft, type ContractDraft, type CustomerDetails } from '@/lib/management/contract-document';
import { canEditIssuedContract, contractProfile, issuedContractNumberError, saveContractProfile } from '@/lib/management/contract-profile';
import { requestManagementTable } from '@/lib/management/management-table';
import { EMPTY_QUERY } from '@/lib/management/table-utils';
import type { ManagementRow } from '@/lib/management/types';

const CUSTOMER_FIELDS: {key:keyof CustomerDetails;label:string;type?:string}[] = [
  {key:'name',label:'Tên khách hàng'}, {key:'phone',label:'Số điện thoại',type:'tel'},
  {key:'id_card',label:'CCCD / Hộ chiếu'}, {key:'address',label:'Địa chỉ'},
  {key:'driver_license_number',label:'Số giấy phép lái xe'},
  {key:'driver_license_issued_on',label:'Ngày cấp GPLX',type:'date'},
];

export function ContractEditDialog({row,onClose,onSaved}:{row:ManagementRow;onClose:()=>void;onSaved:(code:string)=>void}) {
  const {dataset,accessUser}=useManagement();
  const [record,setRecord]=useState<ManagementRow|null>(null);
  const [draft,setDraft]=useState<ContractDraft|null>(null);
  const [notes,setNotes]=useState('');
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
  const [error,setError]=useState(''),[numberError,setNumberError]=useState('');
  const busy=useRef(false),errorRef=useRef<HTMLParagraphElement>(null);
  const load=useCallback(async(signal?:AbortSignal)=>{
    if(!dataset)return;
    setLoading(true);setError('');setRecord(null);setDraft(null);setNumberError('');
    try {
      const result=await requestManagementTable({kind:'contracts',query:{...EMPTY_QUERY,filters:{id:String(row.id)}},store:'all',scope:'',page:1,size:1,sort:'code',direction:'desc'},signal);
      const latest=result.rows.find(item=>item.id===row.id);
      if(!latest || !canEditIssuedContract(accessUser,latest.store_id))throw new Error('Không tìm thấy hợp đồng trong cơ sở được phép sửa.');
      if(latest.status==='draft')throw new Error('Mở bản nháp để tiếp tục chỉnh sửa hợp đồng này.');
      if(!latest.draft_revision)throw new Error('Chưa tải được phiên bản hợp đồng. Thử tải lại.');
      setRecord(latest);setDraft(createContractDraft(dataset,'all',latest));setNotes(String(latest.notes||''));
    } catch(cause) {if(!signal?.aborted)setError(cause instanceof Error?cause.message:'Không tải được hợp đồng.');}
    finally {if(!signal?.aborted)setLoading(false);}
  },[row.id,dataset,accessUser]);
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[load]);

  async function submit(event:FormEvent) {
    event.preventDefault();
    if(busy.current || !draft || !record)return;
    const invalid=issuedContractNumberError(draft.contract_number);
    setNumberError(invalid||'');setError('');
    if(invalid){document.getElementById('edit-contract-number')?.focus();return;}
    busy.current=true;setSaving(true);
    try {
      const result=await saveContractProfile(record.id,String(record.draft_revision),contractProfile(draft),{contract_number:draft.contract_number,notes});
      onSaved(result.code||draft.contract_number.trim());
    } catch(cause) {setError(cause instanceof Error?cause.message:'Chưa lưu được hợp đồng.');requestAnimationFrame(()=>errorRef.current?.focus());}
    finally {busy.current=false;setSaving(false);}
  }
  return <Dialog title="Sửa hợp đồng" subtitle={`${row.code} · ${row.store_name||'Cơ sở hợp đồng'}`} onClose={()=>{if(!busy.current)onClose();}}>
    <form onSubmit={submit} noValidate>
      <div className="mg-dialog-body">
        {loading&&<p role="status"><LoaderCircle size={16} className="mg-spin"/> Đang tải hợp đồng…</p>}
        {draft&&<fieldset className="mg-composer-fields" disabled={saving||loading}>
          <div className="mg-form-grid">
            <div className="mg-field"><label htmlFor="edit-contract-number">Số HĐ giấy *</label>
              <input id="edit-contract-number" type="text" required maxLength={32} value={draft.contract_number} aria-invalid={Boolean(numberError)} aria-describedby={numberError?'edit-contract-number-error':'edit-contract-number-hint'} onChange={event=>{setDraft({...draft,contract_number:event.target.value});setNumberError('');}}/>
              <small id="edit-contract-number-hint">Nhập đúng số trên hợp đồng giấy, giữ nguyên số 0 đầu.</small>
              {numberError&&<p id="edit-contract-number-error" className="mg-field-error">{numberError}</p>}
            </div>
            <div className="mg-field"><label htmlFor="edit-contract-signed">Ngày ký hợp đồng</label><input id="edit-contract-signed" type="date" value={draft.signed_on} onChange={event=>setDraft({...draft,signed_on:event.target.value})}/></div>
            <div className="mg-field mg-field-wide"><label htmlFor="edit-contract-staff">Người làm hợp đồng</label><input id="edit-contract-staff" maxLength={4000} value={draft.staff_name} onChange={event=>setDraft({...draft,staff_name:event.target.value})}/></div>
            {CUSTOMER_FIELDS.map(field=><div className="mg-field" key={field.key}><label htmlFor={`edit-contract-customer-${field.key}`}>{field.label}</label>
              <input id={`edit-contract-customer-${field.key}`} type={field.type||'text'} maxLength={4000} value={draft.customer[field.key]} onChange={event=>setDraft({...draft,customer:{...draft.customer,[field.key]:event.target.value}})}/></div>)}
            <div className="mg-field mg-field-wide"><label htmlFor="edit-contract-notes">Ghi chú hợp đồng</label><textarea id="edit-contract-notes" maxLength={4000} rows={3} value={notes} onChange={event=>setNotes(event.target.value)}/></div>
          </div>
        </fieldset>}
        {error&&<p className="mg-error-message" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
      </div>
      <div className="mg-dialog-footer">
        <button type="button" className="mg-button" disabled={saving||loading} onClick={()=>void load()}>Tải lại hợp đồng</button>
        <button type="button" className="mg-button" disabled={saving} onClick={onClose}>Đóng</button>
        <button type="submit" className="mg-button mg-button-primary" disabled={saving||loading||!draft||!record}>{saving?<LoaderCircle size={16} className="mg-spin"/>:<Save size={16}/>} {saving?'Đang lưu…':'Lưu hợp đồng'}</button>
      </div>
    </form>
  </Dialog>;
}
