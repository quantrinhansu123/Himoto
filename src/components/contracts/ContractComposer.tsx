'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { CheckCircle2, LoaderCircle, Plus, Printer, Save, Search, Trash2, UserPlus } from 'lucide-react';
import { Dialog } from '@/components/management/Dialog';
import { useManagement } from '@/components/management/ManagementProvider';
import { ContractDraft, CustomerDetails, LegacyContractDocument, buildContractDocument, createContractDraft, customerDetails, emptyVehicle, normalizeIdCard, staffIsAvailable, staffMatchesStore, validateContractDraft, vehicleDetails } from '@/lib/management/contract-document';
import { ManagementRow } from '@/lib/management/types';
import { CONTRACT_STATUSES, CONTRACT_TYPES } from '@/lib/management/config';
import { validateDraftSave } from '@/lib/management/contract-drafts';
import { CustomerCreateDialog } from './CustomerCreateDialog';
import { ContractPrintPreview } from './ContractPrintPreview';

type LookupState = 'idle' | 'loading' | 'found' | 'matches' | 'missing' | 'error';
export function ContractComposer({ row, mode = 'print', onClose, onDraftSaved }: { row?: ManagementRow | null; mode?: 'print' | 'edit' | 'draft'; onClose: () => void; onDraftSaved?: () => void }) {
  const { dataset, selectedStore, source, canSaveContractDrafts, contractAutofill, saveContract, saveContractDraft } = useManagement();
  const editingDraft = mode === 'draft' || row?.status === 'draft';
  const canSaveDraft = !row || row.status === 'draft';
  const [draft, setDraft] = useState<ContractDraft>(() => createContractDraft(dataset!, selectedStore, row));
  const [idInput, setIdInput] = useState(draft.customer_lookup ?? draft.customer.id_card);
  const preserveCustomer = useRef(Boolean((row?.draft_json || row?.status === 'draft') && draft.customer_id));
  const [lookupState, setLookupState] = useState<LookupState>((row?.draft_json || row?.status === 'draft') && draft.customer_id ? 'found' : 'idle');
  const [status, setStatus] = useState(row?.status || 'pending');
  const [rentalType, setRentalType] = useState(String(row?.rental_type || 'daily'));
  const [notes, setNotes] = useState(String(row?.notes || ''));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const busy = useRef(false);
  const [lookupError, setLookupError] = useState('');
  const [lookupRetry, setLookupRetry] = useState(0);
  const [customerMatches, setCustomerMatches] = useState<ManagementRow[]>([]);
  const [staff, setStaff] = useState<ManagementRow[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState('');
  const [staffRetry, setStaffRetry] = useState(0);
  const [customerModal, setCustomerModal] = useState(false);
  const [document, setDocument] = useState<LegacyContractDocument | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    setStaff([]); setStaffError(''); setStaffLoading(Boolean(draft.store_id));
    if (draft.store_id) void contractAutofill.loadStaff(draft.store_id, controller.signal).then(rows => {
      if (current) { setStaff(staffMatchesStore(rows, draft.store_id)); setStaffLoading(false); }
    }).catch(cause => { if (current) { setStaffError(cause instanceof Error ? cause.message : 'Không tải được nhân sự.'); setStaffLoading(false); } });
    return () => { current = false; controller.abort(); };
  }, [draft.store_id, contractAutofill, staffRetry]);
  useEffect(() => {
    if (customerModal) return;
    // Opening a copied/saved contract must not replace its snapshot with today's customer profile.
    if (preserveCustomer.current) return;
    if (!draft.store_id) { setLookupState('idle'); setCustomerMatches([]); return; }
    const controller = new AbortController(); let current = true;
    setLookupError('');
    const lookupDigits = idInput.replace(/\D/g, '');
    if (lookupDigits.length < 9 || lookupDigits.length > 13) { setLookupState('idle'); setCustomerMatches([]); return; }
    setLookupState('loading');
    const timer = setTimeout(() => {
      const lookup = contractAutofill.searchCustomers(lookupDigits, draft.store_id, controller.signal);
      void lookup.then(customers => {
        if (!current) return;
        setCustomerMatches(customers);
        if (!customers.length) { setLookupState('missing'); setDraft(previous => ({ ...previous, customer_id: null })); return; }
        if (customers.length > 1) { setLookupState('matches'); return; }
        const customer = customers[0];
        setLookupState('found');
        setDraft(previous => ({ ...previous, customer_id: customer.id, customer: customerDetails(customer),
          vehicles: previous.vehicles.map(vehicle => ({ ...vehicle, driver_name: vehicle.driver_name && vehicle.driver_name !== previous.customer.name ? vehicle.driver_name : customer.name })) }));
      }).catch(cause => {
        if (!current) return;
        setLookupState('error'); setLookupError(cause instanceof Error ? cause.message : 'Không tra cứu được khách hàng.');
        setDraft(previous => ({ ...previous, customer_id: null }));
      });
    }, 350);
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [idInput, source, draft.store_id, contractAutofill, lookupRetry, customerModal]);

  function change<K extends keyof ContractDraft>(key: K, value: ContractDraft[K]) {
    setDraft(previous => ({ ...previous, [key]: value })); setErrors(previous => ({ ...previous, [key]: '' }));
  }
  function changeIdentity(value: string) {
    preserveCustomer.current = false;
    setIdInput(value); setLookupState('idle'); setLookupError(''); setDocument(null);
    setCustomerMatches([]);
    const normalized = normalizeIdCard(value);
    const idCard = /^\d{9}$|^\d{12}$/.test(normalized) ? normalized : '';
    setDraft(previous => ({ ...previous, customer_id: null, customer: { ...customerDetails(), id_card: idCard },
      vehicles: previous.vehicles.map(vehicle => ({ ...vehicle, driver_name: '' })) }));
    setErrors(previous => ({ ...previous, id_card: '' }));
  }
  function selectCustomer(customer: ManagementRow) {
    preserveCustomer.current = true;
    setCustomerMatches([]); setLookupState('found'); setLookupError('');
    setDraft(previous => ({ ...previous, customer_id: customer.id, customer: customerDetails(customer),
      vehicles: previous.vehicles.map(vehicle => ({ ...vehicle, driver_name: vehicle.driver_name && vehicle.driver_name !== previous.customer.name ? vehicle.driver_name : customer.name })) }));
  }
  function customerCreated(customer: ManagementRow) {
    preserveCustomer.current = true;
    setDraft(previous => ({ ...previous, customer_id: customer.id, customer: customerDetails(customer), vehicles: previous.vehicles.map(vehicle => ({ ...vehicle, driver_name: customer.name })) }));
    setIdInput(String(customer.id_card)); setLookupState('found'); setCustomerModal(false);
  }
  function openCustomerCreate() {
    preserveCustomer.current = false;
    if (lookupState === 'found') changeIdentity('');
    setCustomerModal(true);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!dataset || busy.current) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const savingDraft = (submitter instanceof HTMLButtonElement && submitter.value === 'draft') || (editingDraft && !(submitter instanceof HTMLButtonElement && submitter.value === 'preview'));
    const savingRecord = mode === 'edit' && !(submitter instanceof HTMLButtonElement && submitter.value === 'preview');
    const next = savingDraft ? validateDraftSave(draft, dataset) : validateContractDraft(draft, dataset, staff, source);
    if (!savingDraft && lookupState !== 'found') next.id_card = 'Tra cứu hoặc tạo khách hàng trước khi lưu / in.';
    setErrors(next); setSaveError('');
    if (Object.keys(next).length) {
      const details = [...new Set(Object.values(next).filter(Boolean))].slice(0, 3).join(' ');
      setSaveError(`Chưa thể ${savingDraft ? 'lưu nháp' : savingRecord ? 'lưu hợp đồng' : 'tạo bản in'}. ${details}`);
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return;
    }
    if (savingDraft) {
      busy.current = true; setSaving(true);
      try {
        await saveContractDraft(row?.id ?? null, { draft: { ...draft, customer_lookup: idInput }, status: 'draft', rental_type: rentalType, notes,
          ...(source === 'api' && row?.draft_revision ? { revision: String(row.draft_revision) } : {}) });
        onClose(); onDraftSaved?.();
      } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Không lưu được bản nháp. Vui lòng thử lại.'); }
      finally { busy.current = false; setSaving(false); }
      return;
    }
    if (savingRecord && row) {
      busy.current = true; setSaving(true);
      try { await saveContract(row.id, { draft, status, rental_type: rentalType, notes }); onClose(); }
      catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Không lưu được hợp đồng. Vui lòng thử lại.'); }
      finally { busy.current = false; setSaving(false); }
      return;
    }
    try {
      const branch = dataset.stores.find(store => String(store.id) === draft.store_id);
      const representative = staff.find(person => String(person.id) === draft.staff_id);
      if (!branch || !representative) throw new Error('Không tìm thấy cơ sở hoặc nhân sự phụ trách. Hãy chọn lại thông tin rồi thử lại.');
      setDocument(buildContractDocument(draft, branch, representative));
    } catch (cause) {
      setSaveError(cause instanceof Error ? `Không tạo được mẫu hợp đồng: ${cause.message}` : 'Không tạo được mẫu hợp đồng. Vui lòng kiểm tra thông tin và thử lại.');
    }
  }
  const branchStaff = staffMatchesStore(staff, draft.store_id);
  const branchVehicles = dataset?.vehicles.filter(vehicle => String(vehicle.store_id) === draft.store_id) || [];
  const representative = branchStaff.find(person => String(person.id) === draft.staff_id);
  const canSearchCustomer = /^\d{9,13}$/.test(idInput.replace(/\D/g, ''));
  const lookupText = !draft.store_id ? 'Chọn cơ sở cho thuê trước khi tra cứu khách hàng.' : lookupState === 'loading' ? 'Đang tra cứu khách hàng…' : lookupState === 'found' ? `Đã tìm thấy khách hàng #${draft.customer_id} · Thông tin đã tự động điền` : lookupState === 'matches' ? `Tìm thấy ${customerMatches.length} hồ sơ. Chọn đúng khách hàng bên dưới.` : lookupState === 'missing' ? 'Chưa có khách hàng mang giấy tờ hoặc số điện thoại này tại cơ sở đã chọn.' : 'Nhập CCCD/CMND hoặc số điện thoại (9–13 số) để tra cứu.';
  function field(key: keyof Omit<ContractDraft, 'customer' | 'vehicles' | 'customer_id'>, label: string, type = 'text', required = false) {
    return <div className="mg-field" key={key}><label htmlFor={`contract-${key}`}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      <input id={`contract-${key}`} name={key} type={type} value={String(draft[key])} required={required} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 1 : undefined}
        readOnly={Boolean(row) && (mode === 'edit' || editingDraft) && key === 'contract_number'}
        aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `contract-${key}-error` : undefined} onChange={event => change(key, event.target.value)} />
      {errors[key] && <p id={`contract-${key}-error`} className="mg-field-error">{errors[key]}</p>}</div>;
  }
  const customerFields: { key: keyof CustomerDetails; label: string; type?: string; wide?: boolean }[] = [
    { key: 'name', label: 'Họ và tên' }, { key: 'phone', label: 'Số điện thoại', type: 'tel' }, { key: 'email', label: 'Email', type: 'email' },
    { key: 'birthday', label: 'Ngày sinh', type: 'date' }, { key: 'address', label: 'Địa chỉ', wide: true },
    { key: 'id_card_issued_on', label: 'Ngày cấp giấy tờ', type: 'date' }, { key: 'id_card_issued_by', label: 'Nơi cấp giấy tờ' },
    { key: 'relatives_text', label: 'Thông tin người thân', wide: true }, { key: 'warning_note', label: 'Ghi chú / cảnh báo', wide: true },
  ];
  return <>
    <Dialog title={editingDraft ? row ? 'Chỉnh sửa bản nháp' : 'Nhập hợp đồng' : mode === 'edit' ? 'Chỉnh sửa hợp đồng' : 'Điền và in hợp đồng'} subtitle={row ? `${row.code} · ID ${row.id}` : 'Bản nháp · Chưa cấp số hợp đồng'} className="mg-contract-composer" onClose={() => { if (!busy.current) onClose(); }}>
      <form ref={form} noValidate onSubmit={submit}>
        <div className="mg-dialog-body mg-composer-body">
          <div className="mg-composer-notice">{canSaveDraft ? canSaveContractDrafts ? 'Lưu nháp giữ thông tin đang nhập trên hệ thống, kể cả khi chưa điền đủ. Vào mục Log để tiếp tục chỉnh sửa. Bản nháp chưa phát hành hợp đồng.' : 'Đang tra cứu dữ liệu hệ thống. Chức năng ghi bản nháp chưa được kết nối; thông tin đang nhập chưa được lưu.' : mode === 'edit' ? 'Hợp đồng đã có trong danh sách; bản in là bản nháp.' : 'Điền thông tin để xem và in mẫu hợp đồng.'}</div>
          <fieldset className="mg-composer-fields" disabled={saving}>
          {(mode === 'edit' || canSaveDraft) && <fieldset className="mg-composer-section"><legend>Thông tin bản ghi</legend><div className="mg-form-grid">
            {canSaveDraft ? <div className="mg-field"><span>Trạng thái hợp đồng</span><strong className="mg-status mg-status-amber">Lưu nháp</strong></div> : <div className="mg-field"><label htmlFor="contract-record-status">Trạng thái hợp đồng</label><select id="contract-record-status" value={status} onChange={event => setStatus(event.target.value)}>{CONTRACT_STATUSES.filter(option => option.value !== 'draft').map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>}
            <div className="mg-field"><label htmlFor="contract-record-type">Loại hợp đồng</label><select id="contract-record-type" value={rentalType} onChange={event => setRentalType(event.target.value)}>{CONTRACT_TYPES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
            <div className="mg-field mg-field-wide"><label htmlFor="contract-record-notes">Ghi chú hợp đồng</label><textarea id="contract-record-notes" value={notes} onChange={event => setNotes(event.target.value)} /></div>
          </div></fieldset>}
          <fieldset className="mg-composer-section"><legend><span>01</span>Cơ sở và nhân sự</legend><div className="mg-form-grid">
            <div className="mg-field"><label htmlFor="contract-store">Cơ sở cho thuê *</label><select id="contract-store" value={draft.store_id} aria-invalid={Boolean(errors.store_id)} onChange={event => { change('store_id', event.target.value); change('staff_id', ''); change('vehicles', [emptyVehicle()]); change('unit_price', ''); changeIdentity(''); }}>
              <option value="">Chọn cơ sở</option>{dataset?.stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select>{errors.store_id && <p className="mg-field-error">{errors.store_id}</p>}</div>
            <div className="mg-field"><label htmlFor="contract-staff">Nhân sự phụ trách *</label><select id="contract-staff" value={draft.staff_id} disabled={!draft.store_id || staffLoading || Boolean(staffError)} aria-invalid={Boolean(errors.staff_id)} onChange={event => change('staff_id', event.target.value)}>
              <option value="">{staffLoading ? 'Đang tải nhân sự…' : !draft.store_id ? 'Chọn cơ sở trước' : 'Chọn nhân sự tại cơ sở'}</option>{branchStaff.map(person => <option key={person.id} value={person.id} disabled={!staffIsAvailable(person)}>{person.name} · {person.code}{!staffIsAvailable(person) ? ' · Không làm việc' : ''}</option>)}</select>
              {errors.staff_id && <p className="mg-field-error">{errors.staff_id}</p>}{staffError ? <div className="mg-field-error" role="alert">{staffError}<button className="mg-inline-button" type="button" onClick={() => setStaffRetry(value => value + 1)}>Thử lại</button></div> : <small role="status">{draft.store_id && !staffLoading ? `${branchStaff.filter(staffIsAvailable).length} nhân sự đang làm việc tại cơ sở` : 'Danh sách nhân sự sẽ lọc theo cơ sở đã chọn.'}</small>}</div>
            {representative && <div className="mg-composer-person mg-field-wide"><CheckCircle2 size={17} /><span>Đại diện bên A: <strong>{representative.name}</strong> · {representative.position || '—'}</span></div>}
          </div></fieldset>
          <fieldset className="mg-composer-section"><legend><span>02</span>Thông tin khách hàng</legend>
            <div className="mg-composer-customer-actions"><button className="mg-button" type="button" disabled={!draft.store_id} onClick={openCustomerCreate}><UserPlus size={16} />Thêm mới</button></div>
            <div className="mg-field"><label htmlFor="contract-id-card">CCCD / CMND hoặc số điện thoại *</label><div className="mg-lookup-controls"><input id="contract-id-card" autoComplete="off" value={idInput} disabled={!draft.store_id} aria-invalid={Boolean(errors.id_card)} aria-describedby="contract-lookup-status" placeholder={!draft.store_id ? 'Chọn cơ sở trước khi tra cứu khách hàng' : 'CCCD/CMND hoặc SĐT'} onChange={event => changeIdentity(event.target.value)} />
              <button className="mg-button" type="button" disabled={!draft.store_id || !canSearchCustomer || lookupState === 'loading'} onClick={() => { preserveCustomer.current = false; setLookupRetry(value => value + 1); }}>{lookupState === 'loading' ? <LoaderCircle size={16} className="mg-spin" /> : <Search size={16} />}Tra cứu</button></div>
              <div id="contract-lookup-status" className={`mg-lookup-status is-${lookupState}`} role={lookupState === 'error' ? 'alert' : 'status'}>{lookupState === 'error' ? lookupError : lookupText}</div>
              {lookupState === 'matches' && <div className="mg-customer-match-list" role="listbox" aria-label="Chọn khách hàng tìm thấy">{customerMatches.map(customer => <button key={customer.id} type="button" role="option" aria-selected="false" className="mg-customer-match" onClick={() => selectCustomer(customer)}><strong>{customer.name}</strong><span>{customer.phone || 'Chưa có SĐT'} · CCCD {customer.id_card || 'Chưa có'}</span></button>)}</div>}
              {errors.id_card && <p className="mg-field-error">{errors.id_card}</p>}
            </div>
            <div className="mg-form-grid mg-customer-autofill">{customerFields.map(item => <div className={`mg-field ${item.wide ? 'mg-field-wide' : ''}`} key={item.key}><label htmlFor={`contract-customer-${item.key}`}>{item.label}</label><input id={`contract-customer-${item.key}`} type={item.type || 'text'} value={draft.customer[item.key]} disabled={lookupState !== 'found'} aria-invalid={Boolean(errors[item.key])} onChange={event => {
              setDraft(previous => ({ ...previous, customer: { ...previous.customer, [item.key]: event.target.value } })); setErrors(previous => ({ ...previous, [item.key]: '' }));
            }} />{errors[item.key] && <p className="mg-field-error">{errors[item.key]}</p>}</div>)}</div>
            <p className="mg-composer-hint">Thông tin chỉnh tại đây {mode === 'edit' ? 'được lưu riêng cho hợp đồng và mẫu in' : 'dùng trên bản in'}, không cập nhật hồ sơ khách hàng đã có.</p>
          </fieldset>
          <fieldset className="mg-composer-section"><legend><span>03</span>Xe và thời gian thuê</legend>
            <div className="mg-form-grid">{field('signed_on', 'Ngày ký', 'date', true)}{field('contract_number', 'Số hợp đồng (nếu đã cấp)')}{field('start_date', 'Thời gian bắt đầu', 'datetime-local', true)}{field('end_date', 'Thời gian hẹn trả', 'datetime-local', true)}</div>
            {draft.vehicles.map((vehicle, index) => <div key={index} className="mg-composer-vehicle"><div className="mg-composer-vehicle-header"><strong>Xe {index + 1}</strong>{draft.vehicles.length > 1 && <button className="mg-icon-button" type="button" aria-label={`Bỏ xe ${index + 1}`} onClick={() => change('vehicles', draft.vehicles.filter((_, i) => i !== index))}><Trash2 size={16} /></button>}</div>
              <div className="mg-field"><label htmlFor={`contract-vehicle-${index}`}>Xe tại cơ sở *</label><select id={`contract-vehicle-${index}`} disabled={!draft.store_id} value={vehicle.id} aria-invalid={Boolean(errors[`vehicle_${index}`])} onChange={event => {
                const selected = branchVehicles.find(item => String(item.id) === event.target.value);
                change('vehicles', draft.vehicles.map((item, i) => i === index ? selected ? vehicleDetails(selected, draft.customer) : emptyVehicle() : item));
                if (selected && !draft.unit_price && index === 0) change('unit_price', String(selected.daily_price ?? ''));
              }}><option value="">Chọn xe</option>{branchVehicles.map(item => <option key={item.id} value={item.id}>{item.name} · {item.license}</option>)}</select>{errors[`vehicle_${index}`] && <p className="mg-field-error">{errors[`vehicle_${index}`]}</p>}</div>
              {vehicle.id && <div className="mg-composer-vehicle-summary">{vehicle.license} · {vehicle.brand} · {vehicle.type_text} · {vehicle.year || 'Chưa có năm sản xuất'}</div>}
              <div className="mg-form-grid">{(['color', 'driver_name', 'driver_license_number', 'driver_license_issued_on', 'borrow_hats', 'borrow_raincoats'] as const).map(key => {
                const labels = { color: 'Màu xe', driver_name: 'Tên người lái', driver_license_number: 'Số GPLX', driver_license_issued_on: 'Ngày cấp GPLX', borrow_hats: 'Số mũ bảo hiểm', borrow_raincoats: 'Số áo mưa' };
                return <div className="mg-field" key={key}><label htmlFor={`contract-vehicle-${index}-${key}`}>{labels[key]}</label><input id={`contract-vehicle-${index}-${key}`} type={key === 'driver_license_issued_on' ? 'date' : key.startsWith('borrow_') ? 'number' : 'text'} min={key.startsWith('borrow_') ? 0 : undefined} value={vehicle[key]} aria-invalid={Boolean(errors[`vehicle_${index}_${key}`])} onChange={event => change('vehicles', draft.vehicles.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item))} />{errors[`vehicle_${index}_${key}`] && <p className="mg-field-error">{errors[`vehicle_${index}_${key}`]}</p>}</div>;
              })}</div>
            </div>)}
            <button className="mg-button" type="button" disabled={!draft.store_id} onClick={() => change('vehicles', [...draft.vehicles, emptyVehicle()])}><Plus size={16} />Thêm xe vào mẫu</button>
          </fieldset>
          <fieldset className="mg-composer-section"><legend><span>04</span>Thông tin trên mẫu in</legend><div className="mg-form-grid">
            {field('package_name', 'Gói thuê')}{field('unit_price', 'Đơn giá thuê (VNĐ)', 'number')}{field('total_amount', 'Tổng tiền thuê (VNĐ)', 'number')}{field('paid_amount', 'Số tiền đã thanh toán (VNĐ)', 'number')}
            {field('payment_method', 'Hình thức thanh toán ghi trên mẫu')}{field('deposit_amount', 'Số tiền cọc ghi trên mẫu (VNĐ)', 'number')}{field('deposit_payment_method', 'Hình thức cọc ghi trên mẫu')}{field('collateral_description', 'Tài sản thế chấp')}
            {field('authorization_date', 'Ngày ủy quyền', 'date')}{field('customer_source', 'Nguồn khách')}{field('customer_source_url', 'Liên kết nguồn khách', 'url')}
          </div><p className="mg-composer-hint">Các số tiền là thông tin trên mẫu in. Không phát sinh giao dịch thu tiền hay nhận cọc.</p></fieldset>
          </fieldset>{saveError && <p className="mg-error-message" role="alert">{saveError}</p>}
        </div>
        <div className="mg-dialog-footer"><span className="mg-form-note">{canSaveDraft ? '* Cần điền đủ để in; có thể lưu nháp trước' : '* Thông tin bắt buộc'}</span><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Đóng</button>
          {canSaveDraft && <button type="submit" value="draft" className="mg-button mg-button-primary" disabled={saving || !canSaveContractDrafts} title={!canSaveContractDrafts ? 'Chưa kết nối API lưu bản nháp' : undefined}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <Save size={16} />}{saving ? 'Đang lưu…' : 'Lưu nháp'}</button>}
          {mode === 'edit' && !canSaveDraft && <button type="submit" className="mg-button mg-button-primary" disabled={saving || staffLoading || lookupState === 'loading'}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <Save size={16} />}{saving ? 'Đang lưu…' : 'Lưu hợp đồng'}</button>}
          <button type="submit" value="preview" className={`mg-button${mode === 'print' ? ' mg-button-primary' : ''}`} disabled={saving || staffLoading || lookupState === 'loading'}><Printer size={16} />Xem mẫu in</button></div>
      </form>
    </Dialog>
    {customerModal && <CustomerCreateDialog idCard={/^\d{9}$|^\d{12}$/.test(normalizeIdCard(idInput)) ? normalizeIdCard(idInput) : ''} storeId={draft.store_id} onCreated={customerCreated} onClose={() => setCustomerModal(false)} />}
    {document && <ContractPrintPreview doc={document} onClose={() => setDocument(null)} />}
  </>;
}
