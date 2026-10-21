'use client';

import { useCallback, useEffect, useMemo, useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle, RotateCcw, Wallet } from 'lucide-react';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';
import { formatDateTime, formatMoney } from '@/lib/formatters';
import { cashbookPaymentPath } from '@/lib/management/contract-payments';
import { loadContractReturnableItems, ReturnableContractItem, ReturnInput, returnContractItems, searchReturnableItems,type ReturnSettlement } from '@/lib/management/contract-returns';
import { ReturnSettlementFields } from './ReturnSettlementFields';
import { DateTime24Controls } from '@/components/contracts/DateTime24Field';
import { ContractTransactionPhotos } from './ContractTransactionPhotos';
import { ContractTelegramPanel } from './ContractTelegramPanel';
import { DEFAULT_LATE_HOURLY_RATE,lateReturnFee } from '@/lib/management/return-fees';
import { SelectedVehicleGps,useSelectedVehicleGps } from './SelectedVehicleGps';
import { ReturnedVehicleStatus } from './ReturnedVehicleStatus';

const localNow = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 16);
const localMillis = (value: string) => new Date(`${value}:00+07:00`).getTime();
const digits = (value: string) => value.replace(/\D/g, '').slice(0, 13);

interface Estimate { late: boolean; early: boolean; minutes: number; hours: number; unusedDays: number; suggested: number;lateDays?:number;missingDayPrice?:boolean }

function estimateFor(row: ReturnableContractItem, returnedAt: string, hourlyRate: string): Estimate {
  const scheduled = row.scheduled_return_at ? new Date(row.scheduled_return_at).getTime() : NaN;
  const returned = localMillis(returnedAt);
  if (!Number.isFinite(scheduled) || !Number.isFinite(returned)) return { late: false, early: false, minutes: 0, hours: 0, unusedDays: 0, suggested: 0 };
  if (returned > scheduled) {
    const minutes = Math.ceil((returned - scheduled) / 60_000);
    const fee=lateReturnFee(minutes,Number(hourlyRate||DEFAULT_LATE_HOURLY_RATE),row.daily_price);
    return { late: true, early: false, minutes, hours:fee.hours,lateDays:fee.days,missingDayPrice:fee.amount===null,unusedDays:0,suggested:fee.amount??0 };
  }
  const unusedDays = Math.floor((scheduled - returned) / 86_400_000);
  return { late: false, early: returned < scheduled, minutes: 0, hours: 0, unusedDays, suggested: unusedDays * (row.daily_price || 0) };
}

function lateText(minutes: number, hours: number,days=0) {
  return `Quá hạn ${Math.floor(minutes / 1440)} ngày ${Math.floor((minutes % 1440) / 60)} giờ ${minutes % 60} phút · tính phí ${days?`${days} ngày${hours?' + ':''}`:''}${hours?`${hours} giờ`:''}`;
}

export function ContractRowReturnDialog({ contractId, contractCode = '',initialQuery='', onClose }: { contractId?: number; contractCode?: string;initialQuery?:string; onClose: () => void }) {
  const { notify, reload, invalidateData, canPayContracts } = useManagement();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState(initialQuery||contractCode);
  const [rows, setRows] = useState<ReturnableContractItem[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [repairs,setRepairs]=useState<Record<string,{amount:string;note:string}>>({});
  const [settlements,setSettlements]=useState<Record<number,ReturnSettlement|undefined>>({});
  const [settlementBlocks,setSettlementBlocks]=useState<Record<number,boolean>>({});
  const searchGeneration=useRef(0);
  const [returnedAt, setReturnedAt] = useState(localNow);
  const lastValidReturnedAt=useRef(returnedAt);
  const [hourlyRate, setHourlyRate] = useState(String(DEFAULT_LATE_HOURLY_RATE));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoPending,setPhotoPending]=useState<Record<number,boolean>>({});
  const [photoVersion,setPhotoVersion]=useState(0);
  const photosPending=Object.values(photoPending).some(Boolean);
  const wasPhotosPending=useRef(false);
  const formRef=useRef<HTMLFormElement>(null);
  useEffect(()=>{
    if(wasPhotosPending.current&&!photosPending){setPhotoVersion(value=>value+1);setError('');}
    wasPhotosPending.current=photosPending;
  },[photosPending]);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ orderId: number; telegramEvents: {orderId:number;key:string}[]; code: string; due: number | null; depositHeld: number; closes: boolean } | null>(null);

  const accept = useCallback((result: ReturnableContractItem[]) => {
    setRows(result);
    setOverrides({});
    setRepairs({});setSettlements({});setSettlementBlocks({});
    const active=result.filter(row=>!row.completed_at);
    setPicked(new Set(active.map(row=>row.order_id)).size===1?active.map(row => String(row.item_id)):[]);
  }, []);

  const loadItems = useCallback(async (term: string, signal?: AbortSignal) => {
    if (!term.trim()) return;
    const generation=++searchGeneration.current;
    setLoading(true); setError(''); setRows([]); setPicked([]);
    try {
      const result=await searchReturnableItems(term, signal);if(generation===searchGeneration.current&&!signal?.aborted)accept(result);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được xe trong hợp đồng.');
    } finally { if (!signal?.aborted&&generation===searchGeneration.current) setLoading(false); }
  }, [accept]);

  useEffect(() => {
    const controller = new AbortController();
    if (contractId !== undefined) {
      setLoading(true); setError(''); setRows([]); setPicked([]);
      void loadContractReturnableItems(contractId, controller.signal).then(accept).catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được xe của hợp đồng.');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    } else if (contractCode.trim()) {
      void loadItems(contractCode, controller.signal);
    } else {
      setLoading(false);
    }
    return () => controller.abort();
  }, [contractId, contractCode, loadItems, accept]);
  useEffect(()=>{if(contractId!==undefined||contractCode||searchTerm.trim().length<3)return;const controller=new AbortController();const timer=setTimeout(()=>void loadItems(searchTerm,controller.signal),350);return()=>{clearTimeout(timer);controller.abort();};},[searchTerm,contractId,contractCode,loadItems]);

  const openRows = rows.filter(row => !row.completed_at);
  const doneRows = rows.filter(row => row.completed_at);
  const lines = useMemo(() => rows.filter(row => picked.includes(String(row.item_id))).map(row => {
    const estimate = estimateFor(row, returnedAt, hourlyRate);
    const override = overrides[String(row.item_id)];
    const amount = override === undefined ? estimate.suggested : Number(override || 0);
    const repair=repairs[String(row.item_id)];
    return { row, estimate, override, amount,repairFee:Number(repair?.amount||0),repairNote:repair?.note||'', adjustment: (estimate.late ? amount : estimate.early ? -amount : 0)+Number(repair?.amount||0) };
  }), [rows, picked, overrides, repairs,returnedAt, hourlyRate]);
  const selectedGps=useSelectedVehicleGps(lines.map(line=>line.row.vehicle_id));

  const orderIds = new Set(lines.map(line => line.row.order_id));
  const settlementBlocked=[...orderIds].some(id=>settlementBlocks[id]!==false);
  const summary = orderIds.size === 1 ? (() => {
    const first = lines[0].row;
    const adjustment = lines.reduce((sum, line) => sum + line.adjustment, 0);
    const total = first.total_amount === null ? null : first.total_amount + adjustment;
    const paid = first.paid_amount ?? 0;
    const remainingOpen = openRows.filter(row => row.order_id === first.order_id).length - lines.length;
    return { adjustment, total, paid, due: total === null ? null : total - paid, depositHeld: first.deposit_held, closes: remainingOpen === 0 };
  })() : null;

  function toggle(id: string) {
    setPicked(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  }

  function changeReturnedAt(value:string){
    if(Number.isFinite(localMillis(value))){
      const previous=lastValidReturnedAt.current;
      setOverrides(current=>Object.fromEntries(Object.entries(current).map(([id,amount])=>{
        const row=rows.find(item=>String(item.item_id)===id);if(!row)return [id,amount];
        const before=estimateFor(row,previous,hourlyRate),after=estimateFor(row,value,hourlyRate);
        // A late fee cannot silently become an early-return discount, or the reverse.
        return [id,before.late!==after.late||before.early!==after.early?'0':amount];
      })));
      lastValidReturnedAt.current=value;
    }
    setReturnedAt(value);
  }

  function showProblem(message:string,selector:string){
    setError(message);notify(message);
    requestAnimationFrame(()=>{
      const target=formRef.current?.querySelector<HTMLElement>(selector);if(!target)return;
      const controls=Array.from(target.querySelectorAll<HTMLElement>('input:not([disabled]),button:not([disabled]),select:not([disabled])'));
      const control=target.matches('input,button,select')?target:controls.find(item=>item.getAttribute('aria-invalid')==='true')||controls.find(item=>item.matches('input[type="radio"]')&&item.getClientRects().length>0)||controls.find(item=>item.getClientRects().length>0);
      for(let parent=(control||target).parentElement;parent;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true;
      target.scrollIntoView({block:'center'});
      control?.focus({preventScroll:true});
    });
  }

  async function submit() {
    if (!lines.length || saving) return;
    if(photosPending){
      showProblem('Ảnh/video vừa chọn chưa lưu. Bấm «Lưu ảnh / video» rồi xác nhận trả xe.','.mg-saved-photos-commit');return;
    }
    if(settlementBlocked){
      showProblem('Hoàn tất mục Thu phí và hoàn cọc: chọn đã hoàn hoặc chưa hoàn cọc, và kiểm tra thông tin được báo lỗi.','.mg-return-settlement[aria-busy="true"], .mg-return-settlement[data-blocked="true"]');return;
    }
    if(invalid){
      showProblem('Nhập phí quá hạn thực tế; có thể nhập 0đ khi không thu.','.mg-return-line-adjust input');return;
    }
    setSaving(true); setError('');
    try {
      const items: ReturnInput[] = lines.map(({ row, estimate, override, amount,repairFee,repairNote }) => ({
        item_id: row.item_id, item_revision: row.item_revision, returned_at: returnedAt, hourly_rate: hourlyRate||String(DEFAULT_LATE_HOURLY_RATE),
        ...(estimate.late && override !== undefined ? { fee_override: String(amount) } : {}),
        ...(estimate.early && amount > 0 ? { early_discount: String(amount) } : {}),
        ...(repairFee?{repair_fee:String(repairFee),repair_note:repairNote}:{}),
      }));
      const chosen=Object.values(settlements).filter((value):value is ReturnSettlement=>Boolean(value&&orderIds.has(value.order_id)));
      const results = await returnContractItems(items,chosen);
      const net = results.reduce((sum, result) => sum + result.fee, 0);
      const code = results[0]?.contract_code || contractCode;
      const orderId = lines[0]?.row.order_id ?? contractId;
      notify(`${code}: đã trả ${results.length} xe${net > 0 ? `, cộng ${formatMoney(net)} phí phát sinh` : net < 0 ? `, giảm ${formatMoney(-net)} doanh thu do trả sớm` : ''}.`);
      invalidateData(['vehicles', 'customers']);
      await reload(['contracts']);
      if (orderId) setDone({
        orderId, code, telegramEvents:[...new Set(lines.map(line=>line.row.order_id))].map(id=>({orderId:id,key:`return:${id}:${lines.filter(line=>line.row.order_id===id).map(line=>line.row.item_id).sort((a,b)=>a-b).join(',')}`})),
        due: summary?.due===null||summary?.due===undefined?null:summary.due-chosen.flatMap(row=>row.receipts).reduce((sum,row)=>sum+Number(row.amount),0),
        depositHeld: Math.max((summary?.depositHeld ?? 0)-chosen.reduce((sum,row)=>sum+Number(row.refund?.amount||0),0),0),
        closes: summary?.closes ?? false,
      });
      else onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không ghi nhận được trả xe.'); }
    finally { setSaving(false); }
  }

  function openCashbook(purpose: 'debt' | 'extra' | 'deposit_refund') {
    if (!done) return;
    onClose();
    router.push(cashbookPaymentPath(done.orderId, purpose));
  }

  const invalid = lines.some(line => line.override !== undefined && !/^\d{1,13}$/.test(line.override)||line.estimate.missingDayPrice&&line.override===undefined);
  const subtitle = rows[0] ? `${rows[0].contract_code} · ${rows[0].customer_name}` : contractId !== undefined ? 'Đang tải xe trực tiếp từ hợp đồng đã chọn' : 'Tìm theo mã hợp đồng, CCCD, biển số hoặc SĐT khách để trả xe';

  function close() {
    if (saving) return;
    if (photosPending && !window.confirm('Có ảnh/video chưa lưu vào hồ sơ. Đóng sẽ bỏ các tệp chưa lưu. Anh/chị vẫn muốn đóng?')) return;
    onClose();
  }

  return <Dialog title={contractCode ? `Trả xe · ${contractCode}` : 'Trả xe'} subtitle={subtitle} onClose={close}>
    {/* Only the confirmation button records a return. Enter in a field cannot confirm it. */}
    <form ref={formRef} onSubmit={event => event.preventDefault()}>
      <div className="mg-dialog-body">
        {done ? <div className="mg-cashbook-followup" role="status">
          <p>Đã trả xe hợp đồng {done.code}{done.due !== null && done.due > 0 ? ` · còn thiếu ${formatMoney(done.due)}` : ''}{done.depositHeld > 0 ? ` · cọc đang giữ ${formatMoney(done.depositHeld)}` : ''}.</p>
          {done.depositHeld>0&&<p role="alert">Chưa ghi nhận hoàn hết cọc. Hệ thống còn giữ {formatMoney(done.depositHeld)}; kiểm tra phiếu chi nếu đã hoàn tiền thực tế.</p>}
          {done.telegramEvents.map(event=><ContractTelegramPanel key={event.key} id={event.orderId} eventKey={event.key}/>)}
          {done.due!==null&&done.due<=0&&done.depositHeld===0?<p>Đã ghi nhận đủ các khoản thu và hoàn cọc đã chọn trong lượt trả xe.</p>:canPayContracts ? <>
            <p>Bấm nút bên dưới để mở phiếu thu/chi Sổ quỹ đã điền sẵn theo cấu trúc hợp đồng.</p>
            {(done.due === null || done.due > 0) && <button type="button" className="mg-button mg-button-primary" onClick={() => openCashbook('debt')}><Wallet size={16} />Điền thu công nợ vào sổ quỹ</button>}
            {done.due !== null && done.due <= 0 && <button type="button" className="mg-button" onClick={() => openCashbook('extra')}><Wallet size={16} />Điền phiếu thu thêm vào sổ quỹ</button>}
            {done.depositHeld > 0 && <button type="button" className="mg-button" onClick={() => openCashbook('deposit_refund')}><Wallet size={16} />Điền chi trả cọc vào sổ quỹ</button>}
          </> : <p>Chỉ kế toán hoặc quản trị viên mới điền được phiếu thu/chi vào sổ quỹ.</p>}
        </div> : <>
        {!contractCode && <div className="mg-return-search"><label className="mg-sr-only" htmlFor="contract-return-search">Mã hợp đồng, CCCD, biển số hoặc SĐT khách</label><input autoFocus id="contract-return-search" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void loadItems(searchTerm); } }} placeholder="Mã HĐ, CCCD, biển số hoặc SĐT khách" /><button className="mg-button" type="button" disabled={loading || !searchTerm.trim()} onClick={() => void loadItems(searchTerm)}>{loading ? <LoaderCircle size={15} className="mg-spin" /> : null}Tìm</button></div>}
        {contractCode && !rows.length && loading && <p role="status"><LoaderCircle size={17} className="mg-spin" /> Đang tải xe của hợp đồng…</p>}
        {!loading && rows.length === 0 && !error && (searchTerm ? <p>{contractCode ? 'Hợp đồng này không có xe trong danh sách chi tiết để trả.' : 'Không tìm thấy xe khớp mã hợp đồng, CCCD, biển số hoặc SĐT khách.'}</p> : <p>Nhập mã hợp đồng, CCCD, biển số hoặc SĐT khách để tra cứu xe cần trả.</p>)}
        {rows.length > 0 && !openRows.length && <><p role="status">Tất cả xe trong hợp đồng đã được trả. Bổ sung ảnh/video bên dưới; không ghi nhận trả hoặc quyết toán lần hai.</p><details className="mg-return-options"><summary>Xem tình trạng xe sau trả</summary><ReturnedVehicleStatus rows={rows}/></details></>}
        {openRows.length > 0 && <>
          <h3>1. Xe trả và phí thực tế</h3><details className="mg-return-options"><summary>Giờ trả và cách tính phí gợi ý</summary><div className="mg-form-grid mg-contract-grid-two">
            <div className="mg-field"><label htmlFor="contract-returned-at">Ngày giờ trả thực tế (24h)</label><DateTime24Controls id="contract-returned-at" label="Ngày giờ trả thực tế" value={returnedAt} onChange={changeReturnedAt} /></div>
            <div className="mg-field"><label htmlFor="contract-return-hourly-rate">Đơn giá trễ / giờ (VNĐ)</label><input id="contract-return-hourly-rate" type="number" min={0} max={5000000} step={1} placeholder="20000" value={hourlyRate} onBlur={()=>{if(!hourlyRate)setHourlyRate(String(DEFAULT_LATE_HOURLY_RATE));}} onChange={event => setHourlyRate(event.target.value)} /><small>Chỉ dùng tính gợi ý. Giữ nguyên phí thực tế đã nhập, kể cả 0đ.</small></div>
          </div></details>
          <div className="mg-return-lines" role="group" aria-label="Xe cần trả">
            {openRows.map(row => {
              const id = String(row.item_id);
              const line = lines.find(item => String(item.row.item_id) === id);
              const estimate = line?.estimate ?? estimateFor(row, returnedAt, hourlyRate);
              const value = line?.override ?? (estimate.missingDayPrice?'':String(estimate.suggested));
              return <div key={id} className={`mg-return-line${estimate.late ? ' is-late' : ''}${line ? '' : ' is-off'}`}>
                <label className="mg-return-line-head"><input type="checkbox" checked={Boolean(line)} onChange={() => toggle(id)} /><strong>{row.vehicle_name} · {row.license}</strong>{orderIds.size > 1 || contractCode === '' ? <span>{row.contract_code}</span> : null}</label>
                <span className="mg-return-line-time">Thuê {formatDateTime(row.scheduled_start_at)} → hạn {formatDateTime(row.scheduled_return_at)}</span>
                {line&&<details className="mg-return-options"><summary>Xem vị trí GPS</summary><SelectedVehicleGps vehicleId={row.vehicle_id} data={selectedGps}/></details>}
                {line && <div className="mg-return-line-adjust">
                  <span>{estimate.late ? lateText(estimate.minutes, estimate.hours,estimate.lateDays) : estimate.early ? `Trả sớm${estimate.unusedDays ? ` ${estimate.unusedDays} ngày` : ' (dưới 1 ngày)'}${row.daily_price ? ` · ${formatMoney(row.daily_price)}/ngày` : ''}` : 'Trả đúng hạn · không điều chỉnh'}</span>
                  {estimate.missingDayPrice&&line?.override===undefined&&<p className="mg-field-error">Chưa có giá ngày để gợi ý. Nhập phí thực tế, kể cả 0đ.</p>}
                  {(estimate.late || estimate.early) && <label>{estimate.late ? 'Phí quá hạn thực tế (+)' : 'Giảm doanh thu (−)'}
                    <input type="text" inputMode="numeric" aria-label={estimate.late?`Phí quá hạn thực tế ${row.license}`:`Giảm doanh thu ${row.license}`} value={value} onChange={event => {setOverrides(current => ({ ...current, [id]: digits(event.target.value) }));setError('');}} /><span>VNĐ</span></label>}
                  {estimate.late&&<button type="button" className="mg-button" onClick={()=>{setOverrides(current=>({...current,[id]:'0'}));setError('');}}>Không thu phí quá hạn (0đ)</button>}
                </div>}
                {line&&<details className="mg-return-options"><summary>Phí sửa chữa{line.repairFee?` · ${formatMoney(line.repairFee)}`:' (nếu có)'}</summary><div className="mg-form-grid mg-contract-grid-two"><div className="mg-field"><label htmlFor={`return-repair-${id}`}>Thu sửa chữa do khách làm hỏng (VNĐ)</label><input id={`return-repair-${id}`} inputMode="numeric" value={repairs[id]?.amount||''} placeholder="0" onChange={event=>setRepairs(current=>({...current,[id]:{amount:digits(event.target.value),note:current[id]?.note||''}}))}/></div>{Number(repairs[id]?.amount)>0&&<div className="mg-field"><label htmlFor={`return-repair-note-${id}`}>Nội dung hư hỏng / sửa chữa</label><input id={`return-repair-note-${id}`} required maxLength={1000} value={repairs[id]?.note||''} onChange={event=>setRepairs(current=>({...current,[id]:{amount:current[id]?.amount||'',note:event.target.value}}))}/></div>}</div></details>}
              </div>;
            })}
          </div>
          {summary && <dl className="mg-return-summary">
            <div><dt>Điều chỉnh tiền thuê</dt><dd>{summary.adjustment > 0 ? '+' : summary.adjustment < 0 ? '−' : ''}{formatMoney(Math.abs(summary.adjustment))}</dd></div>
            <div><dt>Tiền thuê sau trả xe</dt><dd>{summary.total === null ? 'Chưa có' : formatMoney(summary.total)}</dd></div>
            <div><dt>Đã thu tiền thuê</dt><dd>{formatMoney(summary.paid)}</dd></div>
            <div><dt>{summary.due !== null && summary.due < 0 ? 'Thu thừa' : 'Còn thiếu (không trừ cọc)'}</dt><dd>{summary.due === null ? '—' : formatMoney(Math.abs(summary.due))}</dd></div>
            <div><dt>Cọc đang giữ</dt><dd>{formatMoney(summary.depositHeld)}</dd></div>
          </dl>}
          {[...orderIds].map(orderId=>{const selected=lines.filter(line=>line.row.order_id===orderId);return <ReturnSettlementFields key={orderId} orderId={orderId} itemIds={selected.map(line=>line.row.item_id)} photoVersion={photoVersion} lateFee={selected.reduce((sum,line)=>sum+(line.estimate.late?line.amount:0),0)} repairFee={selected.reduce((sum,line)=>sum+line.repairFee,0)} netAdjustment={selected.reduce((sum,line)=>sum+line.adjustment,0)} closes={openRows.filter(row=>row.order_id===orderId).length===selected.length} onChange={value=>setSettlements(current=>({...current,[orderId]:value}))} onBlockChange={blocked=>setSettlementBlocks(current=>current[orderId]===blocked?current:{...current,[orderId]:blocked})} early={selected.some(line=>line.estimate.early)} late={selected.some(line=>line.estimate.late)} disabled={saving}/>;})}
          {lines.map(({row})=><ContractTransactionPhotos key={row.item_id} id={row.order_id} phase={`return-${row.item_id}`} title={`Ảnh trả xe và hồ sơ · ${row.license}`} onPendingChange={pending=>setPhotoPending(current=>current[row.item_id]===pending?current:{...current,[row.item_id]:pending})} onSaved={()=>setPhotoVersion(value=>value+1)}/>)}
          <p className="mg-composer-hint">Chỉ ghi phiếu cho khoản đã chọn thu / hoàn. Còn nợ: giữ hợp đồng Chờ tất toán.</p>
        </>}
        {doneRows.map(row => <ContractTransactionPhotos key={row.item_id} id={row.order_id} phase={`return-${row.item_id}`} title={`Bổ sung ảnh trả xe ${row.license}`} onPendingChange={pending=>setPhotoPending(current=>current[row.item_id]===pending?current:{...current,[row.item_id]:pending})}/>)}
        {error && <p className="mg-error-message" role="alert">{error}</p>}
        </>}
      </div>
      <div className="mg-dialog-footer">{photosPending&&<span role="status">Có ảnh/video mới chưa lưu.</span>}<button type="button" className="mg-button" disabled={saving} onClick={close}>{done || !openRows.length ? 'Đóng' : 'Hủy'}</button>{!done && openRows.length > 0 && <button type="button" onClick={event => { const invalidField=event.currentTarget.form?.querySelector<HTMLInputElement>('input:invalid,select:invalid');if(invalidField){for(let parent=invalidField.parentElement;parent;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true;invalidField.reportValidity();return;}void submit(); }} className="mg-button mg-button-primary" disabled={loading || saving || !lines.length}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <RotateCcw size={16} />}{saving ? 'Đang ghi nhận…' : `Xác nhận trả ${lines.length} xe`}</button>}</div>
    </form>
  </Dialog>;
}
