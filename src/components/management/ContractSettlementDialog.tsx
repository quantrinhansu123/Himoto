'use client';
import { useEffect,useRef,useState,type FormEvent } from 'react';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';
import { DateTime24Controls } from '@/components/contracts/DateTime24Field';
import { formatMoney } from '@/lib/formatters';
import { canSettleContract } from '@/lib/management/permissions';
import { BadDebtRecoveryDialog } from './BadDebtRecoveryDialog';
import { PAYMENT_METHODS,PaymentRequestError,loadPaymentContext,paymentAccounts,paymentAccountKey,saveContractSettlement,vietnamPaymentTime,type ContractSettlementInput,type ContractSettlementMode,type PaymentContext,type PaymentMethod } from '@/lib/management/contract-payments';

export function ContractSettlementDialog({id,onClose,onSaved,onOther,initialMode='partial'}:{id:number;onClose:()=>void;onSaved?:()=>void;onOther?:()=>void;initialMode?:ContractSettlementMode}) {
  const {accessUser,acceptContractPayment,notify}=useManagement();
  const [context,setContext]=useState<PaymentContext|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[success,setSuccess]=useState('');
  const [mode,setMode]=useState<ContractSettlementMode>(initialMode),[amount,setAmount]=useState(''),[method,setMethod]=useState<PaymentMethod>('cash'),[accountKey,setAccountKey]=useState('');
  const [at,setAt]=useState(vietnamPaymentTime),[note,setNote]=useState(''),[confirmed,setConfirmed]=useState(false),[pending,setPending]=useState<ContractSettlementInput|null>(null),[saving,setSaving]=useState(false);
  const [vehicles,setVehicles]=useState<Record<number,{status:'with_customer'|'returned';returned_at?:string}>>({}),[recovery,setRecovery]=useState(false);
  const busy=useRef(false),key=`himoto-contract-settlement-${id}`;
  useEffect(()=>{
    try{
      const saved=JSON.parse(sessionStorage.getItem(key)||'null');
      if(saved&&typeof saved.request_id==='string'&&['partial','full','close_unpaid'].includes(saved.mode)){
        setPending(saved);setMode(saved.mode);setAmount(saved.amount);setMethod(saved.method||'cash');setAccountKey(saved.account_id?`${saved.method==='cash'?'cash':'bank'}:${saved.account_id}`:'');setAt(saved.paid_at);setNote(saved.note);setConfirmed(true);setVehicles(Object.fromEntries((saved.vehicles||[]).map((v:NonNullable<ContractSettlementInput['vehicles']>[number])=>[v.item_id,{status:v.status,...(v.returned_at?{returned_at:v.returned_at}:{})}])));
        setError('Có thao tác chưa xác nhận. Thử lại cùng mã để kiểm tra kết quả và tránh ghi trùng.');
      }
    }catch{/* Invalid browser data is never submitted automatically. */}
    const controller=new AbortController();
    loadPaymentContext(id,controller.signal).then(setContext).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[id,key]);
  const remaining=context?.settlement_remaining??context?.remaining??null;
  const total=context?.settlement_total??context?.total_amount??null;
  const closed=context?.status==='completed';
  const effectiveAmount=pending?.amount??(mode==='close_unpaid'?'0':mode==='full'?String(remaining??''):amount);
  const receiving=Number(effectiveAmount)>0,closing=mode!=='partial'&&!closed;
  const accounts=context?paymentAccounts(context,method):[],selected=accountKey||(accounts.length===1?paymentAccountKey(accounts[0]):'');
  const locked=saving||Boolean(pending);
  const allowed=canSettleContract(accessUser);
  const active=context&&['renting','overdue','wait_payment','bad_debt','completed'].includes(context.status)&&!context.hold_active&&!context.completed_from_hold&&(!closed||Number(remaining)>0);
  async function refresh(){setLoading(true);setError('');try{setContext(await loadPaymentContext(id));}catch(e){setError(e instanceof Error?e.message:'Không tải được hợp đồng.');}finally{setLoading(false);}}
  async function submit(event:FormEvent){
    event.preventDefault();if(busy.current||!context||!allowed)return;
    const account=accounts.find(a=>paymentAccountKey(a)===selected);
    if(!pending&&(!active||!confirmed||remaining===null||closing&&context.items.some(item=>!vehicles[item.id])||receiving&&!account||!/^\d{1,13}$/.test(effectiveAmount))){setError('Kiểm tra công nợ, tài khoản nhận và xác nhận trạng thái từng xe.');return;}
    const input:ContractSettlementInput=pending??{request_id:crypto.randomUUID(),revision:context.revision,mode,amount:effectiveAmount,paid_at:at,note:note.trim(),confirmed:true,...(receiving?{method,account_id:account!.id}:{}),...(closing?{vehicles_confirmed:true,vehicles:context.items.map(item=>({item_id:item.id,revision:item.revision,...vehicles[item.id]}))}:{})};
    try{sessionStorage.setItem(key,JSON.stringify(input));}catch{setError('Không lưu được mã thao tác. Cho phép trình duyệt lưu dữ liệu rồi thử lại.');return;}
    busy.current=true;setSaving(true);setPending(input);setError('');setSuccess('');
    try{
      const result=await saveContractSettlement(id,input);
      sessionStorage.removeItem(key);setPending(null);setContext(result.context);acceptContractPayment(result.context);setConfirmed(false);setAmount('');setMode('partial');setVehicles({});
      const message=input.mode==='partial'?`Đã thu ${formatMoney(Number(input.amount))}. Hợp đồng ${result.context.status==='completed'?'đã đóng trước đó; tiếp tục theo dõi công nợ.':'tiếp tục mở.'}`:input.mode==='close_unpaid'?'Đã đóng hợp đồng, không tạo phiếu thu. Công nợ và tiền cọc tiếp tục được theo dõi.':`Đã thu đủ công nợ${result.context.status==='completed'?' và đóng hợp đồng':''}.`;
      setSuccess(message);notify(message);onSaved?.();
    }catch(e){
      const definite=e instanceof PaymentRequestError&&e.status>=400&&e.status<500;
      if(definite){sessionStorage.removeItem(key);setPending(null);setConfirmed(false);try{setContext(await loadPaymentContext(id));}catch{setContext(null);}}
      setError(`${e instanceof Error?e.message:'Chưa xác nhận được thao tác.'}${definite?'':' Giữ nguyên mã và bấm Thử lại để tránh ghi trùng.'}`);
    }finally{busy.current=false;setSaving(false);}
  }
  if(recovery&&context)return <BadDebtRecoveryDialog id={id} code={context.code} onClose={()=>{setRecovery(false);void refresh();}} onRecovered={()=>{onSaved?.();void refresh();}}/>;
  return <Dialog title={`Thanh toán & đóng hợp đồng · ${context?.code||`#${id}`}`} onClose={()=>{if(!busy.current)onClose();}}>
    <form onSubmit={submit}><div className="mg-dialog-body">
      {loading&&<p role="status">Đang tải hợp đồng…</p>}
      {context&&<>
        <dl className="mg-payment-totals"><div><dt>Giá trị hợp đồng</dt><dd>{total===null?'Chưa đối chiếu':formatMoney(total)}</dd></div><div><dt>Đã thanh toán</dt><dd>{context.paid_amount===null?'Chưa đối chiếu':formatMoney(context.paid_amount)}</dd></div><div><dt>Công nợ còn lại</dt><dd>{remaining===null?'Chưa đối chiếu':formatMoney(remaining)}</dd></div><div><dt>Cọc đang giữ</dt><dd>{formatMoney(context.deposit_held)}</dd></div></dl>
        {closed&&<p role="status">Hợp đồng đã đóng. Có thể tiếp tục thu công nợ; lịch sử đóng được giữ nguyên.</p>}
        {closed&&context.items.length>0&&<p role="status">Còn {context.items.length} xe chưa trả/thu hồi. Xe tiếp tục bị giữ, không được cho thuê hoặc điều chuyển như xe rảnh. <button type="button" className="mg-button" disabled={locked} onClick={()=>setRecovery(true)}>Ghi nhận xe đã thu hồi</button></p>}
        <fieldset className="mg-form-grid" disabled={locked||loading||!allowed}>
          <legend>Chọn cách xử lý</legend>
          <label className="mg-field mg-field-wide">Thanh toán<select aria-label="Cách thanh toán và đóng hợp đồng" value={mode} onChange={e=>{setMode(e.target.value as ContractSettlementMode);setConfirmed(false);setError('');setSuccess('');}}>
            <option value="partial">{closed?'Thanh toán một phần công nợ':'Thanh toán một phần · giữ hợp đồng mở'}</option>
            <option value="full">{closed?'Thanh toán toàn bộ công nợ':'Thanh toán toàn bộ · đóng hợp đồng'}</option>
            {!closed&&<option value="close_unpaid">Không thanh toán · vẫn đóng hợp đồng</option>}
          </select></label>
          {mode==='partial'&&<label className="mg-field mg-field-wide">Số tiền thanh toán (VNĐ)<input aria-label="Số tiền thanh toán (VNĐ)" inputMode="numeric" required value={amount.replace(/\B(?=(\d{3})+(?!\d))/g,'.')} onChange={e=>{const value=e.target.value.replaceAll('.','');if(/^\d{0,13}$/.test(value))setAmount(value);setConfirmed(false);}}/></label>}
          {mode==='full'&&<p className="mg-field-wide">Thu đúng số tiền còn lại: <strong>{remaining===null?'Chưa đối chiếu':formatMoney(remaining)}</strong>. {closed?'Giữ nguyên ngày đóng trước đó.':'Sau khi ghi nhận, hợp đồng chuyển sang Đã đóng.'}</p>}
          {mode==='close_unpaid'&&<p className="mg-field-wide">Số tiền thu lần này: <strong>0 đ</strong>. Không tạo phiếu thu, không miễn nợ và không ghi tăng doanh thu. Công nợ hiện có và tiền cọc giữ nguyên.</p>}
          {closing&&<fieldset className="mg-field-wide"><legend>Xác nhận trạng thái xe trước khi đóng</legend>
            {context.items.length?context.items.map(item=><div className="mg-form-grid" key={item.id}>
              <label className="mg-field mg-field-wide">{item.license||item.name}<select aria-label={`Trạng thái xe ${item.license||item.id}`} required value={vehicles[item.id]?.status||''} onChange={e=>{const status=e.target.value as 'with_customer'|'returned';setVehicles(current=>({...current,[item.id]:{status,...(status==='returned'?{returned_at:at}:{})}}));setConfirmed(false);}}><option value="">Chọn trạng thái thực tế</option><option value="with_customer">Xe còn ở khách · tiếp tục theo dõi thu hồi</option><option value="returned">Xe đã trả / thu hồi về cơ sở</option></select></label>
              {vehicles[item.id]?.status==='returned'&&<label className="mg-field mg-field-wide">Ngày giờ thực tế trả / thu hồi<DateTime24Controls id={`settlement-return-${item.id}`} label={`Ngày thu hồi ${item.license||item.id}`} value={vehicles[item.id].returned_at||''} onChange={value=>{setVehicles(current=>({...current,[item.id]:{status:'returned',returned_at:value}}));setConfirmed(false);}}/></label>}
            </div>):<p>Đã ghi nhận trả/thu hồi đủ xe. Xác nhận bên dưới để đóng hợp đồng.</p>}
            <p>Đóng hợp đồng không tự xác nhận xe đã trả. Xe còn ở khách tiếp tục bị giữ cho đến khi ghi nhận thu hồi thực tế.</p>
          </fieldset>}
          <label className="mg-field mg-field-wide">Ngày giờ {receiving?'thanh toán':'đóng hợp đồng'}<DateTime24Controls id="settlement-at" label="Ngày giờ thanh toán hoặc đóng" value={at} onChange={setAt}/></label>
          {receiving&&<>
            <label className="mg-field mg-field-wide">Hình thức thanh toán<select aria-label="Hình thức thanh toán" value={method} onChange={e=>{setMethod(e.target.value as PaymentMethod);setAccountKey('');setConfirmed(false);}}>{PAYMENT_METHODS.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className="mg-field mg-field-wide">Tài khoản nhận<select aria-label="Tài khoản nhận" required value={selected} onChange={e=>{setAccountKey(e.target.value);setConfirmed(false);}}><option value="">Chọn tài khoản nhận</option>{accounts.map(a=><option key={paymentAccountKey(a)} value={paymentAccountKey(a)}>{a.label}</option>)}</select></label>
            {!accounts.length&&<p className="mg-field-error mg-field-wide">Chưa có tài khoản nhận phù hợp với hình thức và cơ sở hợp đồng.</p>}
          </>}
          <label className="mg-field mg-field-wide">Ghi chú<textarea aria-label="Ghi chú thanh toán hoặc đóng" rows={2} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label>
          <label className="mg-checkbox mg-field-wide"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{receiving?'Tôi đã kiểm tra tiền thực nhận và xác nhận ghi phiếu thu.':'Tôi xác nhận đóng mà không thu tiền; tiếp tục theo dõi toàn bộ công nợ còn lại.'}{closing?' Tôi xác nhận đóng hợp đồng.':''}</label>
        </fieldset>
        {!active&&<p role="status">Trạng thái hiện tại chưa cho phép thanh toán/đóng hợp đồng.</p>}
      </>}
      {error&&<p className="mg-field-error" role="alert">{error}</p>}{success&&<p role="status">{success}</p>}
      {!context&&!loading&&<button type="button" className="mg-button" onClick={()=>void refresh()}>Tải lại</button>}
    </div><div className="mg-dialog-footer">
      <button type="button" className="mg-button" disabled={saving} onClick={onClose}>Đóng cửa sổ</button>
      {onOther&&<button type="button" className="mg-button" disabled={locked} onClick={onOther}>Lịch sử / thu chi khác</button>}
      <button type="submit" className="mg-button mg-button-primary" disabled={saving||loading||!allowed||!context||!pending&&(!active||!confirmed||closing&&context.items.some(item=>!vehicles[item.id])||receiving&&!accounts.length)}>{saving?'Đang ghi nhận…':pending?'Thử lại cùng mã thao tác':mode==='partial'?'Ghi nhận thanh toán một phần':mode==='full'?(closed?'Thu đủ công nợ':'Thu đủ và đóng hợp đồng'):'Đóng hợp đồng không thu tiền'}</button>
    </div></form>
  </Dialog>;
}
