'use client';
import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { Dialog } from './Dialog';
import { DateTime24Controls } from '@/components/contracts/DateTime24Field';
import { useManagement } from './ManagementProvider';
import { VehiclePicker } from '@/components/contracts/VehiclePicker';
import { mapApiRow } from '@/lib/management/repository';
import type { ManagementRow } from '@/lib/management/types';
import { canHoldContract,contractHoldDeadline,legacyResumePlan,lifecycleActionLabel,lifecycleDisplayStatus,loadContractLifecycle,localLifecycleTime,resumeInstallmentPlan,saveContractLifecycle,type ContractLifecycleAction,type ContractLifecycleContext } from '@/lib/management/contract-lifecycle';
import { formatDateTime,formatMoney } from '@/lib/formatters';
import { MANAGEMENT_CONFIG,optionLabel } from '@/lib/management/config';
import { installmentSchedule } from '@/lib/management/contract-billing';
import { ContractBadDebtDialog } from './ContractBadDebtDialog';

export function ContractLifecyclePanel({id,reloadKey,onChanged,onRecover,onPayment}:{id:number;reloadKey:number;onChanged:(context:ContractLifecycleContext)=>void;onRecover:()=>void;onPayment?:(purpose:'debt'|'deposit_refund'|'extra')=>void}){
  const {can,notify,invalidateData}=useManagement();
  const [context,setContext]=useState<ContractLifecycleContext|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [action,setAction]=useState<ContractLifecycleAction|null>(null),[at,setAt]=useState(localLifecycleTime),[note,setNote]=useState(''),[confirmed,setConfirmed]=useState(false),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState('');
  const [inventory,setInventory]=useState<ManagementRow[]>([]),[stockLoading,setStockLoading]=useState(false),[stockError,setStockError]=useState(''),[stockVersion,setStockVersion]=useState(0),[selected,setSelected]=useState<string[]>([]);
  const [end,setEnd]=useState(''),[packageName,setPackageName]=useState('Theo tháng'),[amount,setAmount]=useState('');
  const request=useRef(crypto.randomUUID()),busy=useRef(false);
  const refresh=useCallback((signal?:AbortSignal)=>{setLoading(true);setError('');return loadContractLifecycle(id,signal).then(next=>{if(!signal?.aborted){setContext(next);onChanged(next);}}).catch(cause=>{if(!signal?.aborted)setError(cause instanceof Error?cause.message:'Không đọc được tình trạng hợp đồng.');}).finally(()=>{if(!signal?.aborted)setLoading(false);});},[id,onChanged]);
  useEffect(()=>{const controller=new AbortController();void refresh(controller.signal);return()=>controller.abort();},[refresh,reloadKey]);
  useEffect(()=>{
    if(action!=='resume')return;const controller=new AbortController();setStockLoading(true);setStockError('');
    void fetch('/api/auth/vehicles/inventory',{signal:controller.signal,cache:'no-store'}).then(async response=>{
      const result=await response.json();if(!response.ok||result.status!=='success'||!Array.isArray(result.data))throw Error('Không tải được kho xe.');
      if(!controller.signal.aborted)setInventory(result.data.map((row:Record<string,unknown>)=>mapApiRow('vehicles',row)));
    }).catch(()=>{if(!controller.signal.aborted)setStockError('Không tải được kho xe. Nhấn Làm mới kho để thử lại.');}).finally(()=>{if(!controller.signal.aborted)setStockLoading(false);});return()=>controller.abort();
  },[action,stockVersion]);
  const preview=useMemo(()=>{
    if(action!=='resume'||!context)return null;
    try{return {plan:context.plan?resumeInstallmentPlan(context.plan,context.held_at||'',at):legacyResumePlan(context.base_total??-1,context.start_at?localLifecycleTime(new Date(context.start_at)):context.held_at||'',at,end,packageName,Number(amount)).plan,error:''};}
    catch(cause){return {plan:null,error:cause instanceof Error?cause.message:'Chưa lập được lịch còn lại.'};}
  },[action,context,at,end,packageName,amount]);
  function open(next:ContractLifecycleAction){setAction(next);setAt(localLifecycleTime());setNote('');setConfirmed(false);setSaveError('');setSelected(Array.from({length:context?.resume_vehicle_count||1},()=>''));setEnd('');setAmount('');request.current=crypto.randomUUID();}
  async function save(){
    if(!context||!action||busy.current||!confirmed||note.trim().length<5)return;
    busy.current=true;setSaving(true);setSaveError('');
    try{const next=await saveContractLifecycle(id,{action,revision:context.revision,request_id:request.current,note:note.trim(),at,confirmed,
      ...(action==='resume'?{vehicle_ids:selected.map(Number),...(!context.plan?{resume_end:end,resume_package:packageName,resume_amount:amount}:{})}:{})});
      setContext(next);onChanged(next);invalidateData(['contracts','vehicles']);notify(next.status==='completed'?'Đã trả đủ xe và tất toán: hợp đồng đã đóng.':lifecycleActionLabel[action]+' thành công.');setAction(null);
    }catch(cause){setSaveError(cause instanceof Error?cause.message:'Chưa lưu được thao tác.');}
    finally{busy.current=false;setSaving(false);}
  }
  const money=(value:number|null)=>value===null?'Cần đối chiếu':formatMoney(value);
  return <>
    {loading&&!context?<p role="status">Đang đối chiếu xe, công nợ và tiền cọc…</p>:context&&<>
      <p><strong>{optionLabel(MANAGEMENT_CONFIG.contracts,'status',lifecycleDisplayStatus(context))}</strong> · {context.contract_type_name||(context.rental_type?optionLabel(MANAGEMENT_CONFIG.contracts,'rental_type',context.rental_type):context.ownership?'Thuê sở hữu':'Thuê xe')}</p>
      <dl className="mg-contract-detail-grid">
        <div><dt>Trả / thu hồi xe</dt><dd>{context.all_returned?'Đã trả tất cả xe':`Đã trả ${context.returned_count}/${context.items.length} lượt xe`}</dd></div>
        <div><dt>Tất toán</dt><dd>{context.settled?'Đã xác nhận tất toán':'Chưa tất toán'}<p>{context.settlement_note}</p></dd></div>
        <div><dt>Tiền thuê / phí còn phải đối chiếu</dt><dd>{money(context.remaining)}</dd></div>
        <div><dt>Cọc còn giữ / tiền thu dư</dt><dd>{money(context.deposit_held)} / {money(context.overpayment)}</dd></div>
      </dl>
      {context.status==='bad_debt'&&<p>Hợp đồng giữ Nợ xấu đến khi đã trả/thu hồi tất cả xe và xác nhận tất toán. Xe thu hồi xong được cho thuê lại khi Lưu kho và không có hợp đồng khác giữ.</p>}
      {context.status==='reserved'&&<p>Đang bảo lưu từ {context.held_at?formatDateTime(context.held_at+':00+07:00'):'—'}. Đã thu xe về, dừng kỳ thuê mới; nợ và cọc cũ giữ nguyên.</p>}
      {context.ownership&&['renting','overdue','wait_payment'].includes(context.status)&&<p>Chỉ bảo lưu khi hợp đồng còn thời hạn; quá hạn đóng tiền vẫn được bảo lưu nếu hợp đồng chưa hết hạn.{contractHoldDeadline(context)<=Date.now()?' Hợp đồng đã hết thời hạn, không thể bảo lưu.':''}</p>}
      <div className="mg-heading-actions">
        {can('contracts.return')&&context.overdue&&<button className="mg-button" onClick={()=>open('mark_bad_debt')}>Chuyển sang Nợ xấu</button>}
        {can('contracts.return')&&context.status==='bad_debt'&&!context.all_returned&&<button className="mg-button" onClick={onRecover}>Thu hồi xe nợ xấu</button>}
        {(can('contracts.return')||can('finance.write'))&&context.status==='bad_debt'&&!context.settled&&<button className="mg-button" disabled={!context.can_settle} onClick={()=>open('settle')}>Xác nhận tất toán</button>}
        {onPayment&&['bad_debt','reserved'].includes(context.status)&&<button className="mg-button" onClick={()=>onPayment(Number(context.remaining)>0?'debt':context.deposit_held>0?'deposit_refund':'extra')}>Thanh toán / xử lý cọc</button>}
        {can('contracts.return')&&canHoldContract(context)&&<button className="mg-button" onClick={()=>open('hold')}>Bảo lưu hợp đồng</button>}
        {can('contracts.return')&&context.status==='reserved'&&<button className="mg-button mg-button-primary" onClick={()=>open('resume')}>Thuê lại từ bảo lưu</button>}
        <button className="mg-button" disabled={loading} onClick={()=>void refresh()}>Làm mới tình trạng</button>
      </div>
      <h4>Tình trạng từng xe</h4><ul>{context.items.map(item=><li key={item.id}>{item.license||item.name} · {item.completed_at?`Đã trả/thu hồi ${formatDateTime(item.completed_at)}`:'Chưa trả xe'}</li>)}</ul>
      <h4>Lịch sử trạng thái</h4>{context.events.length?<ul>{context.events.map((event,index)=><li key={index}>{formatDateTime(event.at)} · {event.actor_name||`#${event.actor_id}`} · {event.action==='closed'?'Đóng hợp đồng':lifecycleActionLabel[event.action as ContractLifecycleAction]||event.action}<p>{event.note}</p></li>)}</ul>:<p>Chưa có thao tác trạng thái mới.</p>}
    </>}
    {error&&<p role="alert" className="mg-field-error">{error} <button className="mg-button" onClick={()=>void refresh()}>Thử lại</button></p>}
    {action==='mark_bad_debt'&&context&&<ContractBadDebtDialog id={id} code={context.code} onClose={()=>setAction(null)} onDone={next=>{setContext(next);onChanged(next);setAction(null);}}/>}
    {action&&action!=='mark_bad_debt'&&context&&<Dialog title={lifecycleActionLabel[action]} onClose={()=>{if(!busy.current)setAction(null);}} dismissOnBackdrop={!saving}>
      <form onSubmit={event=>{event.preventDefault();void save();}}><div className="mg-dialog-body">
        <p>{context.code}</p>
        {action==='settle'&&<p>Đối chiếu đủ tiền thuê, phí phát sinh và cọc. {context.all_returned?'Đã trả đủ xe: xác nhận sẽ đóng hợp đồng.':'Chưa trả đủ xe: hợp đồng vẫn Nợ xấu sau khi xác nhận tất toán.'}</p>}
        {action==='hold'&&<p>Chỉ xác nhận khi đã thực tế thu hồi các xe còn đang thuê. Xe được giải phóng để cho thuê lại; lịch đóng tiền dừng phát sinh kỳ mới, nợ và cọc cũ được giữ nguyên.</p>}
        <div className="mg-field"><label htmlFor="lifecycle-at">{action==='hold'?'Ngày giờ thực tế thu xe và bảo lưu':action==='resume'?'Ngày giờ thực tế thuê lại':'Ngày giờ xác nhận'}</label><DateTime24Controls id="lifecycle-at" label={action==='hold'?'Ngày giờ thực tế thu xe và bảo lưu':action==='resume'?'Ngày giờ thực tế thuê lại':'Ngày giờ xác nhận'} value={at} onChange={setAt}/></div>
        {action==='resume'&&<>
          <p>Tiếp tục chính hợp đồng này, giữ toàn bộ nợ/cọc và lịch sử cũ. Chọn đủ xe đang rảnh; xe đã được cho khách khác thuê sẽ bị chặn.</p>
          <button type="button" className="mg-button" disabled={stockLoading} onClick={()=>setStockVersion(value=>value+1)}>Làm mới kho</button>
          {stockLoading&&<p role="status">Đang tải xe toàn hệ thống…</p>}{stockError&&<p role="alert" className="mg-field-error">{stockError}</p>}
          {selected.map((value,index)=><div className="mg-field" key={index}><label htmlFor={`lifecycle-vehicle-${index}`}>Xe thuê lại {index+1}</label><VehiclePicker id={`lifecycle-vehicle-${index}`} index={index} vehicles={inventory} directory={inventory} value={value} storeName="toàn hệ thống" monthly ownOrderId={id} takenIds={selected.filter(Boolean)} disabled={saving||stockLoading||Boolean(stockError)} invalid={false} proposedStart={at} proposedEnd={preview?.plan?.end||end} onChange={next=>setSelected(rows=>rows.map((row,i)=>i===index?next:row))}/></div>)}
          {!context.plan&&<><p>Hợp đồng cũ chưa có lịch đóng tiền. Nhập phần thời gian và mức thu còn lại đã đối chiếu với khách.</p><div className="mg-field"><label htmlFor="lifecycle-resume-end">Kết thúc thời gian còn lại</label><DateTime24Controls id="lifecycle-resume-end" label="Kết thúc thời gian còn lại" value={end} onChange={setEnd}/></div><div className="mg-field"><label htmlFor="lifecycle-package">Kỳ đóng tiền còn lại</label><select id="lifecycle-package" value={packageName} onChange={event=>setPackageName(event.target.value)}>{['Theo ngày','Theo tuần','Theo tháng'].map(value=><option key={value}>{value}</option>)}</select></div><div className="mg-field"><label htmlFor="lifecycle-amount">Tiền mỗi kỳ cho toàn bộ xe (VNĐ)</label><input id="lifecycle-amount" inputMode="numeric" value={amount} onChange={event=>setAmount(event.target.value.replace(/\D/g,''))}/></div></>}
          {preview?.plan&&<p role="status">Giữ các khoản đã phát sinh; lịch còn lại kết thúc {formatDateTime(preview.plan.end+':00+07:00')}. {context.plan?'Chỉ dời các kỳ chưa phát sinh theo thời gian bảo lưu, giữ số tiền gốc.':'Kỳ mới phát sinh từ ngày thuê lại theo lịch vừa nhập.'}</p>}
          {preview?.plan&&<details><summary>Xem lịch đóng tiền sau khi thuê lại</summary><p>Tiền đã đóng tiếp tục được đối chiếu với lịch này; cọc tính riêng.</p><ul>{installmentSchedule(preview.plan).slice(0,120).map(period=><li key={period.number}>{formatDateTime(period.due_at+':00+07:00')} · {formatMoney(period.amount)}{context.held_at&&period.due_at<=context.held_at?' · Khoản cũ giữ nguyên':''}</li>)}</ul>{installmentSchedule(preview.plan).length>120&&<p>Hiển thị 120 kỳ đầu trên tổng {installmentSchedule(preview.plan).length} kỳ.</p>}</details>}
          {preview?.error&&<p className="mg-field-error">{preview.error}</p>}
        </>}
        <div className="mg-field"><label htmlFor="lifecycle-note">Lý do / nội dung đối chiếu</label><textarea id="lifecycle-note" disabled={saving} maxLength={1000} rows={3} value={note} onChange={event=>setNote(event.target.value)}/></div>
        <label className="mg-checkbox"><input type="checkbox" checked={confirmed} disabled={saving} onChange={event=>setConfirmed(event.target.checked)}/>{action==='hold'?'Tôi xác nhận xe đã thực tế thu về, bảo lưu giữ nợ/cọc và dừng kỳ mới':action==='resume'?'Tôi đã đối chiếu xe bàn giao, lịch đóng tiền còn lại và nợ/cọc cũ':'Tôi đã đối chiếu tình trạng xe và các khoản tiền thực tế của hợp đồng'}</label>
        {saveError&&<p className="mg-field-error" role="alert">{saveError}</p>}
      </div><div className="mg-dialog-footer"><button className="mg-button" type="button" disabled={saving} onClick={()=>setAction(null)}>Quay lại</button><button className="mg-button mg-button-primary" disabled={saving||!confirmed||note.trim().length<5||!at||action==='resume'&&(!preview?.plan||stockLoading||Boolean(stockError)||selected.some(value=>!value)||new Set(selected).size!==selected.length)}>{saving?'Đang ghi nhận…':lifecycleActionLabel[action]}</button></div></form>
    </Dialog>}
  </>;
}
