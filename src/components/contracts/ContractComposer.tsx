'use client';

import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, LoaderCircle, Plus, Printer, Save, Search, Trash2, UserPlus } from 'lucide-react';
import { Dialog } from '@/components/management/Dialog';
import { useManagement } from '@/components/management/ManagementProvider';
import { ContractDraft, ContractRelative, CustomerDetails, LegacyContractDocument, buildContractDocument, createContractDraft, customerDetails, emptyVehicle, formatRelatives, normalizeIdCard, pairRelatives, relativesFromRow, staffIsAvailable, staffMatchesStore, validateContractDraft, vehicleDetails } from '@/lib/management/contract-document';
import { ManagementRow } from '@/lib/management/types';
import { CONTRACT_STATUSES, CONTRACT_TYPES, VEHICLE_STATUSES } from '@/lib/management/config';
import { normalize } from '@/lib/management/table-utils';
import { validateDraftSave } from '@/lib/management/contract-drafts';
import { CustomerCreateDialog } from './CustomerCreateDialog';
import { ContractPrintPreview } from './ContractPrintPreview';
import { CONTRACT_FORM_SECTIONS, ContractSection, ContractSectionTabs } from './ContractSectionTabs';

type LookupState = 'idle' | 'loading' | 'found' | 'matches' | 'missing' | 'error';
function customerStatusLabel(status?: string) {
  const value = String(status || '').toLowerCase();
  if (['blacklist', 'bad_debt', 'blocked'].includes(value)) return 'Cảnh báo: khách hàng bị chặn / có nợ xấu';
  if (['warning', 'warning_note'].includes(value)) return 'Có cảnh báo';
  if (['active', '1'].includes(value)) return 'Đang hoạt động';
  if (['draft', '0'].includes(value)) return 'Hồ sơ nháp';
  return status ? `Trạng thái: ${status}` : 'Chưa có trạng thái';
}
const CONTRACT_PAYMENT_METHODS = ['Tiền mặt', 'CK tk cá nhân', 'CK tk công ty'] as const;
const formatMoneyInput = (value: string) => value.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const selectedPaymentMethods = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean);
function rentalUnits(start: string, end: string, monthly: boolean) {
  if (!start || !end) return 0;
  const milliseconds = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 0;
  return Math.max(1, Math.ceil(milliseconds / (monthly ? 30 : 1) / 86_400_000));
}
export function ContractComposer({ row, mode = 'print', onClose, onDraftSaved }: { row?: ManagementRow | null; mode?: 'print' | 'edit' | 'draft'; onClose: () => void; onDraftSaved?: () => void }) {
  const { dataset, selectedStore, source, canSaveContractDrafts, contractAutofill, saveContract, saveContractDraft } = useManagement();
  const editingDraft = mode === 'draft' || row?.status === 'draft';
  const canSaveDraft = !row || row.status === 'draft';
  const [draft, setDraft] = useState<ContractDraft>(() => createContractDraft(dataset!, selectedStore, row));
  const [idInput, setIdInput] = useState(String(draft.customer_lookup ?? draft.customer.id_card ?? ''));
  const preserveCustomer = useRef(Boolean((row?.draft_json || row?.status === 'draft') && draft.customer_id && String(draft.customer.name ?? '').trim()));
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
  const [selectedCustomerStatus, setSelectedCustomerStatus] = useState(() => customerStatusLabel(dataset?.customers.find(customer => customer.id === draft.customer_id)?.status));
  const [staff, setStaff] = useState<ManagementRow[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState('');
  const [staffRetry, setStaffRetry] = useState(0);
  const [customerModal, setCustomerModal] = useState(false);
  const [document, setDocument] = useState<LegacyContractDocument | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [section, setSection] = useState<ContractSection>('contract');
  const [vehicleSearch, setVehicleSearch] = useState<Record<number, string>>({});
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
    const lookupDigits = String(idInput ?? '').replace(/\D/g, '');
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
        setSelectedCustomerStatus(customerStatusLabel(customer.status));
        setDraft(previous => withCustomer(previous, customer));
      }).catch(cause => {
        if (!current) return;
        setLookupState('error'); setLookupError(cause instanceof Error ? cause.message : 'Không tra cứu được khách hàng.');
        setDraft(previous => ({ ...previous, customer_id: null }));
      });
    }, 350);
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [idInput, source, draft.store_id, contractAutofill, lookupRetry, customerModal]);

  function withCustomer(previous: ContractDraft, customer: ManagementRow): ContractDraft {
    const relatives = relativesFromRow(customer);
    const details = customerDetails(customer);
    return { ...previous, customer_id: customer.id, relatives, customer: { ...details, relatives_text: formatRelatives(relatives) },
      vehicles: previous.vehicles.map(vehicle => ({ ...vehicle, driver_name: customer.name,
        driver_license_number: details.driver_license_number,
        driver_license_issued_on: details.driver_license_issued_on })) };
  }
  function changeRelative(index: 0 | 1, key: keyof ContractRelative, next: string) {
    setDraft(previous => {
      const relatives = previous.relatives.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: next } : item) as [ContractRelative, ContractRelative];
      return { ...previous, relatives, customer: { ...previous.customer, relatives_text: formatRelatives(relatives) } };
    });
    setErrors(previous => ({ ...previous, [`relative_${index}_${key}`]: '' })); setSaveError('');
  }
  function change<K extends keyof ContractDraft>(key: K, value: ContractDraft[K]) {
    setDraft(previous => ({ ...previous, [key]: value })); setErrors(previous => ({ ...previous, [key]: '' })); setSaveError('');
  }
  function changePaymentMethods(key: 'payment_method' | 'deposit_payment_method', method: typeof CONTRACT_PAYMENT_METHODS[number], checked: boolean) {
    const current = selectedPaymentMethods(draft[key]);
    const next = checked ? [...current, method] : current.filter(value => value !== method);
    change(key, next.join(', '));
  }
  function moneyField(key: 'deposit_amount' | 'unit_price' | 'total_amount', label: string, readOnly = false) {
    const inputId = `contract-${key}`;
    return <div className="mg-field" key={key}><label htmlFor={inputId}>{label}</label>
      <input id={inputId} name={key} type="text" inputMode="numeric" value={formatMoneyInput(draft[key])} readOnly={readOnly}
        aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${inputId}-error` : undefined}
        onChange={event => change(key, event.target.value.replace(/\D/g, ''))} />
      {errors[key] && <p id={`${inputId}-error`} className="mg-field-error">{errors[key]}</p>}</div>;
  }
  function paymentMethodField(key: 'payment_method' | 'deposit_payment_method', label: string) {
    const chosen = selectedPaymentMethods(draft[key]);
    return <div className="mg-field" key={key}><span className="mg-field-label">{label}</span>
      <details className="mg-method-picker"><summary>{chosen.length ? chosen.join(', ') : 'Chọn một hoặc nhiều hình thức'}</summary>
        <div className="mg-method-picker-options">{CONTRACT_PAYMENT_METHODS.map(method => <label key={method}>
          <input type="checkbox" checked={chosen.includes(method)} onChange={event => changePaymentMethods(key, method, event.target.checked)} />{method}
        </label>)}</div>
      </details></div>;
  }
  function changeIdentity(value: string) {
    preserveCustomer.current = false;
    setSelectedCustomerStatus('Chưa tra cứu');
    setIdInput(value); setLookupState('idle'); setLookupError(''); setDocument(null); setSaveError('');
    setCustomerMatches([]);
    const normalized = normalizeIdCard(value);
    const idCard = /^\d{9}$|^\d{12}$/.test(normalized) ? normalized : '';
    setDraft(previous => ({ ...previous, customer_id: null, customer: { ...customerDetails(), id_card: idCard }, relatives: pairRelatives(null),
      vehicles: previous.vehicles.map(vehicle => ({ ...vehicle, driver_name: '' })) }));
    setErrors(previous => ({ ...previous, id_card: '' }));
  }
  function selectCustomer(customer: ManagementRow) {
    preserveCustomer.current = true;
    setCustomerMatches([]); setLookupState('found'); setLookupError('');
    setSelectedCustomerStatus(customerStatusLabel(customer.status));
    setDraft(previous => withCustomer(previous, customer));
  }
  function customerCreated(customer: ManagementRow) {
    preserveCustomer.current = true;
    setSelectedCustomerStatus(customerStatusLabel(customer.status));
    setDraft(previous => withCustomer(previous, customer));
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
    const next = savingDraft ? validateDraftSave(draft, { ...dataset, staff }) : validateContractDraft(draft, dataset, staff, source);
    if (!savingDraft && lookupState !== 'found') next.id_card = 'Tra cứu hoặc tạo khách hàng trước khi lưu / in.';
    setErrors(next); setSaveError('');
    if (Object.keys(next).length) {
      const details = [...new Set(Object.values(next).filter(Boolean))].slice(0, 3).join(' ');
      setSaveError(`Chưa thể ${savingDraft ? 'lưu nháp' : savingRecord ? 'lưu hợp đồng' : 'tạo bản in'}. ${details}`);
      requestAnimationFrame(() => {
        const invalid = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]:not([disabled])');
        const panel = invalid?.closest<HTMLElement>('[data-contract-section]');
        if (panel) setSection(panel.dataset.contractSection as ContractSection);
        requestAnimationFrame(() => invalid?.focus());
      }); return;
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
      const representative = staff.find(person => String(person.id) === draft.staff_id) || (draft.staff_name.trim() ? { id: -1, code: '', status: 'active', name: draft.staff_name.trim(), position: '' } : undefined);
      if (!branch || !representative) throw new Error('Không tìm thấy cơ sở hoặc nhân sự phụ trách. Hãy chọn lại thông tin rồi thử lại.');
      setDocument(buildContractDocument(draft, branch, representative));
    } catch (cause) {
      setSaveError(cause instanceof Error ? `Không tạo được mẫu hợp đồng: ${cause.message}` : 'Không tạo được mẫu hợp đồng. Vui lòng kiểm tra thông tin và thử lại.');
    }
  }
  const branchStaff = staffMatchesStore(staff, draft.store_id);
  const branchVehicles = dataset?.vehicles.filter(vehicle => String(vehicle.store_id) === draft.store_id) || [];
  const pricingVehicle = branchVehicles.find(vehicle => String(vehicle.id) === draft.vehicles[0]?.id);
  const monthlyPackage = draft.package_name === 'Theo tháng';
  useEffect(() => {
    const rate = monthlyPackage ? pricingVehicle?.monthly_price : pricingVehicle?.daily_price;
    if (pricingVehicle) {
      const nextRate = rate == null || !Number.isFinite(Number(rate)) ? '' : String(rate);
      setDraft(previous => previous.unit_price === nextRate ? previous : { ...previous, unit_price: nextRate });
    }
  }, [pricingVehicle?.id, pricingVehicle?.daily_price, pricingVehicle?.monthly_price, monthlyPackage]);
  useEffect(() => {
    const units = rentalUnits(draft.start_date, draft.end_date, monthlyPackage);
    if (units && draft.unit_price && Number.isSafeInteger(Number(draft.unit_price))) {
      const total = String(units * Number(draft.unit_price));
      setDraft(previous => previous.total_amount === total ? previous : { ...previous, total_amount: total });
    }
  }, [draft.start_date, draft.end_date, draft.unit_price, monthlyPackage]);
  useEffect(() => {
    const total = (Number(draft.deposit_amount) || 0) + (Number(draft.total_amount) || 0);
    const paid = String(total);
    setDraft(previous => previous.paid_amount === paid ? previous : { ...previous, paid_amount: paid });
  }, [draft.deposit_amount, draft.total_amount]);
  function chooseVehicle(index: number, id: string) {
    const selected = branchVehicles.find(item => String(item.id) === id);
    setVehicleSearch(previous => ({ ...previous, [index]: '' }));
    setDraft(previous => ({
      ...previous,
      vehicles: previous.vehicles.map((item, i) => i === index ? selected ? vehicleDetails(selected, previous.customer) : emptyVehicle() : item),
      unit_price: selected && index === 0 && !previous.unit_price ? String(selected.daily_price ?? '') : previous.unit_price,
    }));
    setErrors(previous => ({ ...previous, [`vehicle_${index}`]: '' }));
    setSaveError('');
  }
  const representative = branchStaff.find(person => String(person.id) === draft.staff_id) || (draft.staff_name.trim() ? { id: -1, code: '', status: 'active', name: draft.staff_name.trim(), position: '' } : undefined);
  const canSearchCustomer = /^\d{9,13}$/.test(String(idInput ?? '').replace(/\D/g, ''));
  const lookupText = !draft.store_id ? 'Chọn cơ sở cho thuê trước khi tra cứu khách hàng.' : lookupState === 'loading' ? 'Đang tra cứu khách hàng…' : lookupState === 'found' ? `Đã tìm thấy khách hàng #${draft.customer_id} · Thông tin đã tự động điền` : lookupState === 'matches' ? `Tìm thấy ${customerMatches.length} hồ sơ. Chọn đúng khách hàng bên dưới.` : lookupState === 'missing' ? 'Chưa có khách hàng mang giấy tờ hoặc số điện thoại này tại cơ sở đã chọn.' : 'Nhập CCCD/CMND hoặc số điện thoại (9–13 số) để tra cứu.';
  function field(key: keyof Omit<ContractDraft, 'customer' | 'vehicles' | 'customer_id'>, label: string, type = 'text', required = false) {
    return <div className="mg-field" key={key}><label htmlFor={`contract-${key}`}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      <input id={`contract-${key}`} name={key} type={type} value={String(draft[key])} required={required} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 1 : undefined}
        readOnly={Boolean(row) && (mode === 'edit' || editingDraft) && key === 'contract_number'}
        aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `contract-${key}-error` : undefined} onChange={event => change(key, event.target.value)} />
      {errors[key] && <p id={`contract-${key}-error`} className="mg-field-error">{errors[key]}</p>}</div>;
  }
  const customerFields: { key: keyof CustomerDetails; label: string; type?: string; wide?: boolean; hint?: string }[] = [
    { key: 'name', label: 'Tên khách hàng' }, { key: 'phone', label: 'SĐT', type: 'tel' },
    { key: 'id_card', label: 'Số CMTND/CCCD' },
    { key: 'id_card_issued_on', label: 'Ngày cấp CCCD', type: 'date' }, { key: 'id_card_issued_by', label: 'Nơi cấp CCCD' },
    { key: 'driver_license_number', label: 'Số giấy phép lái xe' }, { key: 'driver_license_issued_on', label: 'Ngày cấp GPLX', type: 'date' },
    { key: 'address', label: 'Nơi ở hiện tại', wide: true, hint: 'Ghi số nhà, phường/xã, quận/huyện.' },
  ];
  const sectionIndex = CONTRACT_FORM_SECTIONS.findIndex(item => item.id === section);
  function customerField(item: (typeof customerFields)[number]) {
    return <div className={`mg-field ${item.wide ? 'mg-field-wide' : ''}`} key={item.key}>
      <label htmlFor={`contract-customer-${item.key}`}>{item.label}</label>
      <input id={`contract-customer-${item.key}`} type={item.type || 'text'} value={draft.customer[item.key]}
        disabled={lookupState !== 'found'} readOnly={item.key === 'id_card'} aria-invalid={Boolean(errors[item.key])}
        onChange={event => {
          setDraft(previous => ({ ...previous, customer: { ...previous.customer, [item.key]: event.target.value } }));
          setErrors(previous => ({ ...previous, [item.key]: '' })); setSaveError('');
        }} />
      {item.hint && <small>{item.hint}</small>}
      {errors[item.key] && <p className="mg-field-error">{errors[item.key]}</p>}
    </div>;
  }
  function panel(id: ContractSection, title: string, children: ReactNode) {
    return <section id={`contract-composer-panel-${id}`} role="tabpanel" aria-labelledby={`contract-composer-tab-${id}`}
      data-contract-section={id} hidden={section !== id} className="mg-contract-panel">
      <fieldset className="mg-composer-section"><legend>{title}</legend>{children}</fieldset>
    </section>;
  }
  return <>
    <Dialog title={editingDraft ? row ? 'Chỉnh sửa bản nháp' : 'Nhập hợp đồng' : mode === 'edit' ? 'Chỉnh sửa hợp đồng' : 'Điền và in hợp đồng'} subtitle={row ? `${row.code} · ID ${row.id}` : 'Bản nháp · Chưa cấp số hợp đồng'} className="mg-contract-composer" onClose={() => { if (!busy.current) onClose(); }}>
      <form ref={form} noValidate onSubmit={submit}>
        <div className="mg-dialog-body mg-composer-body">
          <div className="mg-composer-notice">{canSaveDraft ? canSaveContractDrafts ? 'Lưu nháp giữ thông tin đang nhập trên hệ thống, kể cả khi chưa điền đủ. Vào mục Log để tiếp tục chỉnh sửa. Bản nháp chưa phát hành hợp đồng.' : 'Đang tra cứu dữ liệu hệ thống. Chức năng ghi bản nháp chưa được kết nối; thông tin đang nhập chưa được lưu.' : mode === 'edit' ? 'Hợp đồng đã có trong danh sách; bản in là bản nháp.' : 'Điền thông tin để xem và in mẫu hợp đồng.'}</div>
          <fieldset className="mg-composer-fields" disabled={saving}>
          <ContractSectionTabs prefix="contract-composer" active={section} onChange={setSection} />
          {panel('contract', 'Thông tin hợp đồng & Pháp lý', <>
            <div className="mg-form-grid mg-contract-grid-three">
              <div className="mg-field"><label htmlFor="contract-record-type">Loại hợp đồng</label><select id="contract-record-type" value={rentalType} onChange={event => { const next = event.target.value; setRentalType(next); change('package_name', next === 'monthly' ? 'Theo tháng' : 'Theo ngày'); }}>{CONTRACT_TYPES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
              {field('signed_on', 'Ngày ký hợp đồng', 'date', true)}
              {field('contract_number', 'Mã hợp đồng / Số HĐ giấy')}
            </div>
            <div className="mg-form-grid mg-contract-grid-two mg-contract-subsection">
              <div className="mg-field"><label htmlFor="contract-created-on">Ngày tạo hợp đồng</label><input id="contract-created-on" type="date" value={draft.created_on} onChange={event => change('created_on', event.target.value)} /><small>Gợi ý hôm nay, có thể chọn ngày khác.</small></div>
              <div className="mg-field"><label htmlFor="contract-customer-source">Nguồn khách</label><input id="contract-customer-source" list="contract-staff-options" value={draft.customer_source} placeholder="Chọn hoặc nhập tên nhân sự" onChange={event => change('customer_source', event.target.value)} /></div>
              <div className="mg-field"><label htmlFor="contract-customer-source-store">Liên kết nguồn khách</label><select id="contract-customer-source-store" value={draft.customer_source_url} onChange={event => change('customer_source_url', event.target.value)}>
                <option value="">Chọn cơ sở</option>{(dataset?.stores || []).map(store => <option key={store.id} value={store.name}>{store.name}</option>)}
                {draft.customer_source_url && !(dataset?.stores || []).some(store => store.name === draft.customer_source_url) && <option value={draft.customer_source_url}>{draft.customer_source_url}</option>}
              </select></div>
            </div>
            <div className="mg-contract-record-status">{canSaveDraft ? <><span>Trạng thái hợp đồng</span><strong className="mg-status mg-status-amber">Lưu nháp</strong></> : mode === 'edit' ? <div className="mg-field"><label htmlFor="contract-record-status">Trạng thái hợp đồng</label><select id="contract-record-status" value={status} onChange={event => setStatus(event.target.value)}>{CONTRACT_STATUSES.filter(option => option.value !== 'draft').map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div> : null}</div>
          </>)}
          {panel('customer', 'Thông tin khách hàng (Bên B)', <>
            <div className="mg-form-grid mg-contract-grid-two">
              <div className="mg-field"><label htmlFor="contract-store">Cửa hàng xe *</label><select id="contract-store" value={draft.store_id} aria-invalid={Boolean(errors.store_id)} onChange={event => { change('store_id', event.target.value); change('staff_id', ''); change('staff_name', ''); change('vehicles', [emptyVehicle()]); change('unit_price', ''); changeIdentity(''); }}>
                <option value="">Chọn cửa hàng</option>{dataset?.stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select>{errors.store_id && <p className="mg-field-error">{errors.store_id}</p>}</div>
              <div className="mg-field"><label htmlFor="contract-staff">Đại diện ủy quyền Bên A (Nhân viên làm hợp đồng) *</label><input id="contract-staff" list="contract-staff-options" value={draft.staff_name || (branchStaff.find(person => String(person.id) === draft.staff_id)?.name || '')} disabled={!draft.store_id} aria-invalid={Boolean(errors.staff_id)} aria-describedby="contract-staff-help" placeholder={staffLoading ? 'Đang tải nhân sự…' : !draft.store_id ? 'Chọn cửa hàng xe trước' : 'Chọn hoặc nhập tên nhân sự'} onChange={event => {
                  const name = event.target.value;
                  const selected = branchStaff.find(person => person.name.toLocaleLowerCase('vi') === name.trim().toLocaleLowerCase('vi') && staffIsAvailable(person));
                  setDraft(previous => ({ ...previous, staff_id: selected ? String(selected.id) : '', staff_name: selected ? '' : name }));
                  setErrors(previous => ({ ...previous, staff_id: '' })); setSaveError('');
                }} />
                <datalist id="contract-staff-options">{branchStaff.filter(staffIsAvailable).map(person => <option key={person.id} value={person.name}>{person.code}</option>)}</datalist>
                {errors.staff_id && <p className="mg-field-error">{errors.staff_id}</p>}{staffError ? <div className="mg-field-error" role="alert">{staffError}<button className="mg-inline-button" type="button" onClick={() => setStaffRetry(value => value + 1)}>Thử lại</button></div> : <small id="contract-staff-help">{draft.store_id && !staffLoading ? `${branchStaff.filter(staffIsAvailable).length} nhân sự đang làm việc tại cửa hàng. Có thể chọn gợi ý hoặc nhập tên mới.` : 'Chọn cửa hàng xe để tải nhân viên làm hợp đồng.'}</small>}</div>
            </div>
            <div className="mg-contract-customer-toolbar">
              <div className="mg-field mg-contract-lookup"><label htmlFor="contract-id-card">Tra cứu theo CCCD / CMND hoặc SĐT *</label><div className="mg-lookup-controls"><input id="contract-id-card" autoComplete="off" value={idInput} disabled={!draft.store_id} aria-invalid={Boolean(errors.id_card)} aria-describedby="contract-lookup-status" placeholder={!draft.store_id ? 'Chọn cửa hàng xe trước' : 'CCCD/CMND hoặc SĐT'} onChange={event => changeIdentity(event.target.value)} />
                <button className="mg-button" type="button" disabled={!draft.store_id || !canSearchCustomer || lookupState === 'loading'} onClick={() => { preserveCustomer.current = false; setLookupRetry(value => value + 1); }}>{lookupState === 'loading' ? <LoaderCircle size={16} className="mg-spin" /> : <Search size={16} />}Tra cứu</button></div>
                <div id="contract-lookup-status" className={`mg-lookup-status is-${lookupState}`} role={lookupState === 'error' ? 'alert' : 'status'}>{lookupState === 'error' ? lookupError : lookupText}</div>{lookupState === 'found' && <span className={`mg-customer-status ${selectedCustomerStatus.includes('Cảnh báo') ? 'is-blocked' : selectedCustomerStatus === 'Có cảnh báo' ? 'is-warning' : selectedCustomerStatus === 'Đang hoạt động' ? 'is-active' : ''}`}>{selectedCustomerStatus}</span>}
                {lookupState === 'matches' && <div className="mg-customer-match-list" role="listbox" aria-label="Chọn khách hàng tìm thấy">{customerMatches.map(customer => <button key={customer.id} type="button" role="option" aria-selected="false" className="mg-customer-match" onClick={() => selectCustomer(customer)}><strong>{customer.name}</strong><span>{customer.phone || 'Chưa có SĐT'} · CCCD {customer.id_card || 'Chưa có'}</span><em>{customerStatusLabel(customer.status)}</em></button>)}</div>}
                {errors.id_card && <p className="mg-field-error">{errors.id_card}</p>}
              </div>
              <button className="mg-button" type="button" disabled={!draft.store_id} onClick={openCustomerCreate}><UserPlus size={16} />Thêm mới</button>
            </div>
            <div className="mg-form-grid mg-contract-grid-three mg-customer-autofill">{customerFields.slice(0, 2).map(customerField)}</div>
            <div className="mg-form-grid mg-contract-grid-three mg-customer-autofill">{customerFields.slice(2).map(customerField)}</div>
            <div className="mg-contract-relatives">{draft.relatives.map((relative, index) => <div className="mg-contract-relative" key={index}>
              <strong>Người thân {index + 1}</strong>
              <div className="mg-form-grid mg-contract-grid-three">{(['name', 'relationship', 'phone'] as const).map(key => {
                const labels = { name: 'Họ tên', relationship: 'Quan hệ', phone: 'SĐT' };
                const errorKey = `relative_${index}_${key}`;
                return <div className="mg-field" key={key}><label htmlFor={`contract-relative-${index}-${key}`}>{labels[key]} người thân {index + 1} *</label>
                  <input id={`contract-relative-${index}-${key}`} type={key === 'phone' ? 'tel' : 'text'} value={relative[key]} disabled={lookupState !== 'found'} aria-invalid={Boolean(errors[errorKey])} onChange={event => changeRelative(index as 0 | 1, key, event.target.value)} />
                  {errors[errorKey] && <p className="mg-field-error">{errors[errorKey]}</p>}</div>;
              })}</div>
            </div>)}</div>
            <p className="mg-composer-hint">Thông tin chỉnh tại đây {mode === 'edit' ? 'được lưu riêng cho hợp đồng và mẫu in' : 'dùng trên bản in'}, không cập nhật hồ sơ khách hàng đã có.</p>
          </>)}
          {panel('vehicle', 'Thông tin phương tiện', <>
            <div className="mg-form-grid mg-contract-grid-two">{field('start_date', 'Thuê lúc', 'datetime-local', true)}{field('end_date', 'Hẹn trả', 'datetime-local', true)}</div>
            <p className="mg-composer-hint">Thời gian thuê và hẹn trả áp dụng cho các xe trong hợp đồng.</p>
            {draft.vehicles.map((vehicle, index) => {
              const query = normalize(vehicleSearch[index] || '');
              const choices = query ? branchVehicles.filter(item => normalize(`${item.name} ${item.license}`).includes(query)) : [];
              return <div key={index} className="mg-composer-vehicle"><div className="mg-composer-vehicle-header"><strong>Thông tin xe thuê số {index + 1}</strong>{draft.vehicles.length > 1 && <button className="mg-icon-button" type="button" aria-label={`Bỏ xe ${index + 1}`} onClick={() => change('vehicles', draft.vehicles.filter((_, i) => i !== index))}><Trash2 size={16} /></button>}</div>
              <div className="mg-field"><label htmlFor={`contract-vehicle-${index}`}>Chọn xe *</label><select id={`contract-vehicle-${index}`} disabled={!draft.store_id} value={vehicle.id} aria-invalid={Boolean(errors[`vehicle_${index}`])} onChange={event => chooseVehicle(index, event.target.value)}><option value="">{draft.store_id ? 'Chọn xe' : 'Chọn cửa hàng xe trước'}</option>{branchVehicles.map(item => <option key={item.id} value={item.id}>{item.name} · {item.license}</option>)}</select>
                {draft.store_id ? <>
                  <input className="mg-vehicle-filter" id={`contract-vehicle-filter-${index}`} aria-label={`Tìm xe ${index + 1}`} value={vehicleSearch[index] || ''} autoComplete="off" placeholder="Tìm tên xe hoặc biển số, rồi bấm xe bên dưới" onChange={event => setVehicleSearch(previous => ({ ...previous, [index]: event.target.value }))} />
                  {choices.length > 0 && <div className="mg-vehicle-option-list" role="listbox" aria-label={`Danh sách xe ${index + 1}`}>{choices.map(item => {
                    const status = VEHICLE_STATUSES.find(option => option.value === item.status)?.label || String(item.status || '');
                    const selected = vehicle.id === String(item.id);
                    const price = monthlyPackage ? item.monthly_price : item.daily_price;
                    return <button key={item.id} type="button" role="option" aria-selected={selected} className={`mg-customer-match mg-vehicle-option${selected ? ' is-selected' : ''}`} onClick={() => chooseVehicle(index, String(item.id))}><strong>{item.name} · {item.license}</strong><span>{[item.brand, status, price == null ? 'Chưa có đơn giá' : `${Number(price).toLocaleString('vi-VN')} đ/${monthlyPackage ? 'tháng' : 'ngày'}`].filter(Boolean).join(' · ')}</span></button>;
                  })}</div>}
                  {!branchVehicles.length && <small>Cửa hàng đã chọn chưa có xe.</small>}
                  {query && branchVehicles.length > 0 && !choices.length && <small>Không có xe khớp từ khóa.</small>}
                </> : <small>Chọn cửa hàng xe ở phần Khách hàng trước khi chọn xe.</small>}
                {errors[`vehicle_${index}`] && <p className="mg-field-error">{errors[`vehicle_${index}`]}</p>}</div>
              {vehicle.id && <div className="mg-composer-vehicle-summary">{vehicle.license} · {vehicle.brand} · {vehicle.type_text} · {vehicle.year || 'Chưa có năm sản xuất'}</div>}
              <div className="mg-form-grid mg-contract-grid-three">{(['driver_name', 'driver_license_number', 'driver_license_issued_on', 'borrow_hats', 'borrow_raincoats', 'color'] as const).map(key => {
                const labels = { color: 'Màu xe', driver_name: 'Tên người lái', driver_license_number: 'Số giấy phép lái xe', driver_license_issued_on: 'Ngày cấp GPLX', borrow_hats: 'Số mũ mượn', borrow_raincoats: 'Số áo mưa' };
                return <div className="mg-field" key={key}><label htmlFor={`contract-vehicle-${index}-${key}`}>{labels[key]}</label><input id={`contract-vehicle-${index}-${key}`} type={key === 'driver_license_issued_on' ? 'date' : 'text'} inputMode={key.startsWith('borrow_') ? 'numeric' : undefined} maxLength={key.startsWith('borrow_') ? 2 : undefined} value={vehicle[key]} aria-invalid={Boolean(errors[`vehicle_${index}_${key}`])} onChange={event => change('vehicles', draft.vehicles.map((item, i) => i === index ? { ...item, [key]: key.startsWith('borrow_') ? event.target.value.replace(/\D/g, '').slice(0, 2) : event.target.value } : item))} />{errors[`vehicle_${index}_${key}`] && <p className="mg-field-error">{errors[`vehicle_${index}_${key}`]}</p>}</div>;
              })}</div>
            </div>;
            })}
            <button className="mg-button" type="button" disabled={!draft.store_id} onClick={() => change('vehicles', [...draft.vehicles, emptyVehicle()])}><Plus size={16} />Thêm xe</button>
          </>)}
          {panel('payment', 'Chi phí', <>
            <div className="mg-contract-cost-section"><h3>Tiền cọc</h3><div className="mg-form-grid mg-contract-grid-two">
              {moneyField('deposit_amount', 'Số tiền đặt cọc (VNĐ)')}{paymentMethodField('deposit_payment_method', 'Hình thức đặt cọc')}
            </div></div>
            <div className="mg-contract-cost-section"><h3>Phí thuê xe</h3><div className="mg-form-grid mg-contract-grid-two">
              <div className="mg-field"><label htmlFor="contract-package_name">Gói thuê</label><select id="contract-package_name" value={draft.package_name} onChange={event => { const next = event.target.value; change('package_name', next); setRentalType(next === 'Theo tháng' ? 'monthly' : 'daily'); }}><option value="Theo ngày">Theo ngày</option><option value="Theo tháng">Theo tháng</option></select></div>
              {moneyField('unit_price', 'Đơn giá áp dụng (VNĐ)')}
              {moneyField('total_amount', 'Tổng phí thuê xe (VNĐ)', true)}
              <div className="mg-field"><label htmlFor="contract-paid-amount">Số tiền đã thanh toán (VNĐ)</label><input id="contract-paid-amount" value={formatMoneyInput(draft.paid_amount)} readOnly /><small>Tự tính bằng tiền cọc + phí thuê xe.</small></div>
              {paymentMethodField('payment_method', 'Hình thức thanh toán')}
            </div></div>
            <p className="mg-composer-hint">Tổng phí thuê tự tính theo đơn giá và thời hạn. Việc ghi các hình thức ở đây không tạo phiếu thu.</p>
          </>)}
          {panel('signing', 'Ký kết & Ghi chú', <div className="mg-form-grid mg-contract-grid-two">
            <div className="mg-field mg-field-wide"><label htmlFor="contract-collateral_description">Tài sản thế chấp / Đặt cọc tài sản</label><textarea id="contract-collateral_description" rows={3} value={draft.collateral_description} onChange={event => change('collateral_description', event.target.value)} placeholder="Chi tiết giấy tờ hoặc tài sản đặt cọc" /></div>
            <div className="mg-field"><label htmlFor="contract-signer-a">Người ký Bên A (Himoto)</label><input id="contract-signer-a" value={representative?.name || ''} readOnly placeholder="Theo đại diện đã chọn" /></div>
            <div className="mg-field"><label htmlFor="contract-signer-b">Người ký Bên B (Khách thuê)</label><input id="contract-signer-b" value={draft.customer.name} readOnly placeholder="Theo khách hàng đã chọn" /></div>
            <div className="mg-field mg-field-wide"><label htmlFor="contract-record-notes">Ghi chú hợp đồng</label><textarea id="contract-record-notes" rows={3} value={notes} onChange={event => setNotes(event.target.value)} /></div>
            <div className="mg-field mg-field-wide"><label htmlFor="contract-customer-warning_note">Cảnh báo</label><textarea id="contract-customer-warning_note" rows={2} value={draft.customer.warning_note} disabled={lookupState !== 'found'} onChange={event => setDraft(previous => ({ ...previous, customer: { ...previous.customer, warning_note: event.target.value } }))} /></div>
          </div>)}
          <div className="mg-contract-step-actions"><span>Phần {sectionIndex + 1} / {CONTRACT_FORM_SECTIONS.length}</span>
            <button type="button" className="mg-button" disabled={sectionIndex === 0} onClick={() => setSection(CONTRACT_FORM_SECTIONS[sectionIndex - 1].id)}><ChevronLeft size={16} />Quay lại</button>
            <button type="button" className="mg-button" disabled={sectionIndex === CONTRACT_FORM_SECTIONS.length - 1} onClick={() => setSection(CONTRACT_FORM_SECTIONS[sectionIndex + 1].id)}>Tiếp tục<ChevronRight size={16} /></button>
          </div>
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
