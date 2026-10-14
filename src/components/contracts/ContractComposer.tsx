'use client';

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, LoaderCircle, Plus, Printer, Save, Search, Trash2, UserPlus } from 'lucide-react';
import { Dialog } from '@/components/management/Dialog';
import { useManagement } from '@/components/management/ManagementProvider';
import { ContractDraft, ContractRelative, CustomerDetails, LegacyContractDocument, buildContractDocument, contractStaffStoreId, createContractDraft, customerDetails, emptyVehicle, formatRelatives, normalizeIdCard, pairRelatives, relativesFromRow, staffIsAvailable, staffMatchesStore, validateContractDraft, validateOperationalDraft, validateReservationDraft, vehicleDetails } from '@/lib/management/contract-document';
import { documentRequirements } from '@/lib/management/contract-requirements';
import { staffRoles } from '@/lib/management/staff-positions';
import { contractProfile,saveContractProfile } from '@/lib/management/contract-profile';
import { ManagementRow } from '@/lib/management/types';
import { CONTRACT_STATUSES, CONTRACT_TYPES } from '@/lib/management/config';
import { validateDraftSave } from '@/lib/management/contract-drafts';
import { CustomerCreateDialog } from './CustomerCreateDialog';
import { ContractPrintPreview } from './ContractPrintPreview';
import { VehiclePicker } from './VehiclePicker';
import { ContractFinalizeDialog } from './ContractFinalizeDialog';
import { FinalizeResult, draftPaymentMethods } from '@/lib/management/contract-finalize';
import { chargeTotal, type ContractCharge } from '@/lib/management/contract-charges';
import { CONTRACT_FORM_SECTIONS, ContractSection, ContractSectionTabs } from './ContractSectionTabs';
import { DateTime24Field } from './DateTime24Field';
import { PaymentMethodPicker } from './PaymentMethodPicker';
import { addRentalDays, rentalDayCount } from '@/lib/management/rental-time';
import { addRentalMonths, billingInterval, createInstallmentPlan, installmentSchedule, isOwnershipStore, OWNERSHIP_TERMS, ownershipTerm, rentalPeriodCount, type OwnershipTerm } from '@/lib/management/contract-billing';

type LookupState = 'idle' | 'loading' | 'found' | 'matches' | 'missing' | 'error';
function customerStatusLabel(status?: string) {
  const value = String(status || '').toLowerCase();
  if (['blacklist', 'bad_debt', 'blocked'].includes(value)) return 'Cảnh báo: khách hàng bị chặn / có nợ xấu';
  if (['warning', 'warning_note'].includes(value)) return 'Có cảnh báo';
  if (['active', '1'].includes(value)) return 'Đang hoạt động';
  if (['draft', '0'].includes(value)) return 'Hồ sơ nháp';
  return status ? `Trạng thái: ${status}` : 'Chưa có trạng thái';
}
const formatMoneyInput = (value: string) => value.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export function ContractComposer({ row, mode = 'print', onClose, onDraftSaved, onFinalized }: { row?: ManagementRow | null; mode?: 'print' | 'edit' | 'draft' | 'reservation'; onClose: () => void; onDraftSaved?: () => void; onFinalized?: (result: FinalizeResult) => void }) {
  const { dataset, selectedStore, source, canSaveContractDrafts, contractAutofill, saveContract, saveContractDraft, ensureData } = useManagement();
  const [attributionError,setAttributionError] = useState('');
  const [profileRevision,setProfileRevision] = useState(String(row?.draft_revision || ''));
  const [profileMessage,setProfileMessage] = useState('');
  useEffect(()=>{void ensureData(['staff']).catch(cause=>setAttributionError(cause instanceof Error ? cause.message : 'Không tải được nhân viên ghi nhận doanh số.'));},[ensureData]);
  const [savedDraft, setSavedDraft] = useState<{ id: number; revision: string } | null>(null);
  const [finalizeTarget, setFinalizeTarget] = useState<{ id: number; revision: string; code: string } | null>(null);
  const editingDraft = mode === 'draft' || mode === 'reservation' || row?.status === 'draft';
  const canSaveDraft = !row || row.status === 'draft';
  const [draft, setDraft] = useState<ContractDraft>(() => {
    const initial = createContractDraft(dataset!, selectedStore, row);
    if (mode === 'reservation' && !row) {
      initial.reservation = true; initial.start_date = addRentalDays(initial.start_date, '1'); initial.end_date = addRentalDays(initial.start_date, '1');
    }
    return initial;
  });
  const reserving = canSaveDraft && Boolean(draft.reservation);
  const [rentalDays, setRentalDays] = useState(() => rentalDayCount(draft.start_date,draft.end_date));
  const [autoReturn, setAutoReturn] = useState(!row);
  const staffStoreId = contractStaffStoreId(draft);
  // A finalized contract (or one of its versions) keeps its ledger total until the user edits dates, price or the first vehicle.
  const livePricing = useRef(row && row.status !== 'draft' ? { start: draft.start_date, end: draft.end_date, unit: draft.unit_price, vehicle: draft.vehicles[0]?.id } : null);
  const [idInput, setIdInput] = useState(String(draft.customer_lookup ?? (draft.customer.id_card || draft.customer.phone || '')));
  const preserveCustomer = useRef(Boolean(row && draft.customer_id && draft.customer.name.trim()));
  const [lookupState, setLookupState] = useState<LookupState>(row && draft.customer_id && draft.customer.name.trim() ? 'found' : 'idle');
  const [status, setStatus] = useState(row?.status || 'pending');
  const [rentalType, setRentalType] = useState(String(row?.rental_type || 'daily'));
  const rentalTypePicked = useRef(false);
  const [notes, setNotes] = useState(String(row?.notes || ''));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const busy = useRef(false);
  const [lookupError, setLookupError] = useState('');
  const [lookupRetry, setLookupRetry] = useState(0);
  const [customerMatches, setCustomerMatches] = useState<ManagementRow[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<ManagementRow | null>(() => dataset?.customers.find(customer => customer.id === draft.customer_id) || null);
  const selectedCustomerStatus = customerStatusLabel(selectedCustomer?.status);
  const [staff, setStaff] = useState<ManagementRow[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState('');
  const [staffRetry, setStaffRetry] = useState(0);
  const [customerModal, setCustomerModal] = useState(false);
  const [document, setDocument] = useState<LegacyContractDocument | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [section, setSection] = useState<ContractSection>('contract');
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    setStaff([]); setStaffError(''); setStaffLoading(Boolean(staffStoreId));
    if (staffStoreId) void contractAutofill.loadStaff(staffStoreId, controller.signal).then(rows => {
      if (current) { setStaff(staffMatchesStore(rows, staffStoreId)); setStaffLoading(false); }
    }).catch(cause => { if (current) { setStaffError(cause instanceof Error ? cause.message : 'Không tải được nhân sự.'); setStaffLoading(false); } });
    return () => { current = false; controller.abort(); };
  }, [staffStoreId, contractAutofill, staffRetry]);
  useEffect(() => {
    if (customerModal) return;
    // Opening a copied/saved contract must not replace its snapshot with today's customer profile.
    if (preserveCustomer.current) return;
    const controller = new AbortController(); let current = true;
    setLookupError('');
    const lookupDigits = String(idInput ?? '').replace(/\D/g, '');
    if (lookupDigits.length < 9 || lookupDigits.length > 13) { setLookupState('idle'); setCustomerMatches([]); return; }
    setLookupState('loading');
    const timer = setTimeout(() => {
      const lookup = contractAutofill.searchCustomers(lookupDigits, controller.signal);
      void lookup.then(customers => {
        if (!current) return;
        setCustomerMatches(customers);
        if (!customers.length || customers.length > 1) {
          setSelectedCustomer(null); setLookupState(customers.length ? 'matches' : 'missing');
          setDraft(previous => ({ ...previous, customer_id: null })); return;
        }
        const customer = customers[0];
        setLookupState('found');
        setSelectedCustomer(customer);
        setDraft(previous => withCustomer(previous, customer));
      }).catch(cause => {
        if (!current) return;
        setSelectedCustomer(null); setLookupState('error'); setLookupError(cause instanceof Error ? cause.message : 'Không tra cứu được khách hàng.');
        setDraft(previous => ({ ...previous, customer_id: null }));
      });
    }, 350);
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [idInput, source, contractAutofill, lookupRetry, customerModal]);

  function withCustomer(previous: ContractDraft, customer: ManagementRow): ContractDraft {
    const relatives = relativesFromRow(customer);
    const details = customerDetails(customer);
    const sourceStoreId = customer.store_id ? String(customer.store_id) : '';
    return { ...previous, vehicle_store_id: contractStaffStoreId(previous), ...(sourceStoreId ? { store_id:sourceStoreId, customer_source_url:String(customer.store_name || '') } : {}),
      customer_id: customer.id, relatives, customer: { ...details, relatives_text: formatRelatives(relatives) },
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
  function changeSourceStore(storeId: string) {
    setDraft(previous => ({...previous,vehicle_store_id:contractStaffStoreId(previous),store_id:storeId,customer_source_url:dataset?.stores.find(store=>String(store.id)===storeId)?.name || ''}));
    setErrors(previous=>({...previous,store_id:''})); setSaveError('');
  }
  function changeVehicleStore(storeId: string) {
    setDraft(previous => ({ ...previous, vehicle_store_id: storeId,
      ...(!previous.store_id && storeId ? { store_id: storeId, customer_source_url: dataset?.stores.find(store=>String(store.id)===storeId)?.name || '' } : {}),
      ...(contractStaffStoreId(previous) !== storeId ? { staff_id: '', staff_name: '' } : {}) }));
    setErrors(previous => ({ ...previous, vehicle_store_id: '', staff_id: '', store_id: '' })); setSaveError('');
  }
  function changeRentalStart(value: string) {
    if (!autoReturn) setRentalDays(rentalDayCount(value,draft.end_date));
    setDraft(previous=>{
      const term = previous.ownership_term_months;
      const end = rentalType === 'ownership' && term && term !== 'custom' ? addRentalMonths(value,Number(term)) : autoReturn ? addRentalDays(value,rentalDays) : '';
      return {...previous,start_date:value,...(end ? {end_date:end} : {})};
    });
    setErrors(previous=>({...previous,start_date:'',end_date:'',rental_days:''})); setSaveError('');
  }
  function changeRentalEnd(value: string) {
    setAutoReturn(false); setRentalDays(rentalDayCount(draft.start_date,value));
    setDraft(previous=>({...previous,end_date:value,...(rentalType === 'ownership' ? {ownership_term_months:ownershipTerm(previous.start_date,value)} : {})}));
    setSaveError('');setErrors(previous=>({...previous,end_date:''}));
    setErrors(previous=>({...previous,rental_days:''}));
  }
  function changeOwnershipTerm(term: OwnershipTerm) {
    setAutoReturn(false);
    setDraft(previous=>({...previous,ownership_term_months:term,...(term !== 'custom' && addRentalMonths(previous.start_date,Number(term)) ? {end_date:addRentalMonths(previous.start_date,Number(term))} : {})}));
    setErrors(previous=>({...previous,end_date:''}));setSaveError('');
  }
  function changeRentalDays(value: string) {
    setRentalDays(value); setAutoReturn(true);
    const end = addRentalDays(draft.start_date,value);
    if (end) setDraft(previous=>({...previous,end_date:end,...(rentalType === 'ownership' ? {ownership_term_months:ownershipTerm(previous.start_date,end)} : {})}));
    setErrors(previous=>({...previous,rental_days:value && !end ? 'Nhập số ngày nguyên lớn hơn 0 và ngày thuê hợp lệ.' : ''}));
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
    return <div className="mg-field" key={key}><span className="mg-field-label">{label}</span>
      <PaymentMethodPicker label={label} value={draft[key]} onChange={value=>change(key,value)} /></div>;
  }
  function changeIdentity(value: string) {
    preserveCustomer.current = false;
    setSelectedCustomer(null);
    setIdInput(value); setLookupState('idle'); setLookupError(''); setDocument(null); setSaveError('');
    setCustomerMatches([]);
    const normalized = normalizeIdCard(value);
    const idCard = /^\d{9}$|^\d{12}$/.test(normalized) ? normalized : '';
    setDraft(previous => ({ ...previous, customer_id: null, customer: { ...customerDetails(), id_card: idCard }, relatives: pairRelatives(null),
      vehicles: previous.vehicles.map(vehicle => ({ ...vehicle, driver_name: '', driver_license_number: '', driver_license_issued_on: '' })) }));
    setErrors(previous => ({ ...previous, id_card: '' }));
  }
  function selectCustomer(customer: ManagementRow) {
    preserveCustomer.current = true;
    setCustomerMatches([]); setLookupState('found'); setLookupError('');
    setSelectedCustomer(customer);
    setDraft(previous => withCustomer(previous, customer));
  }
  function customerCreated(customer: ManagementRow) {
    preserveCustomer.current = true;
    setSelectedCustomer(customer);
    setDraft(previous => withCustomer(previous, customer));
    setIdInput(String(customer.id_card || customer.phone || '')); setLookupState('found'); setCustomerModal(false);
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
    const action = submitter instanceof HTMLButtonElement ? submitter.value : '';
    const finalizing = action === 'finalize' && canSaveDraft;
    const savingDraft = !finalizing && (action === 'draft' || (editingDraft && action !== 'preview'));
    const savingRecord = mode === 'edit' && action !== 'preview';
    const next = savingDraft ? validateDraftSave(draft, { ...dataset, staff }) : finalizing ? reserving ? validateReservationDraft(draft,dataset,staff,source) : validateOperationalDraft(draft,dataset,staff,source) : validateContractDraft(draft,dataset,staff,source);
    if (rentalDays && (!/^\d+$/.test(rentalDays) || !Number.isSafeInteger(Number(rentalDays)) || Number(rentalDays) < 1 || (draft.start_date && !addRentalDays(draft.start_date,rentalDays)))) next.rental_days = 'Nhập số ngày nguyên lớn hơn 0 và ngày thuê hợp lệ.';
    if (!savingDraft && lookupState !== 'found') next.id_card = 'Tra cứu hoặc tạo khách hàng trước khi lưu / in.';
    setErrors(next); setSaveError('');
    if (Object.keys(next).length) {
      const details = [...new Set(Object.values(next).filter(Boolean))].slice(0, 3).join(' ');
      setSaveError(`Chưa thể ${finalizing ? 'lưu chính thức' : savingDraft ? 'lưu nháp' : savingRecord ? 'lưu hợp đồng' : 'tạo bản in'}. ${details}`);
      requestAnimationFrame(() => {
        const invalid = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]:not([disabled])');
        const panel = invalid?.closest<HTMLElement>('[data-contract-section]');
        if (panel) setSection(panel.dataset.contractSection as ContractSection);
        requestAnimationFrame(() => invalid?.focus());
      }); return;
    }
    if (savingDraft || finalizing) {
      busy.current = true; setSaving(true);
      const revision = savedDraft?.revision ?? (row?.draft_revision ? String(row.draft_revision) : '');
      try {
        const saved = await saveContractDraft(savedDraft?.id ?? row?.id ?? null, { draft: { ...draft, customer_lookup: idInput }, status: 'draft', rental_type: rentalType, notes,
          ...(source === 'api' && revision ? { revision } : {}) });
        if (finalizing) {
          setSavedDraft({ id: saved.id, revision: String(saved.draft_revision) });
          setFinalizeTarget({ id: saved.id, revision: String(saved.draft_revision), code: saved.code });
        } else { onClose(); onDraftSaved?.(); }
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
      const branch = dataset.stores.find(store => String(store.id) === staffStoreId);
      const representative = staff.find(person => String(person.id) === draft.staff_id) || (draft.staff_name.trim() ? { id: -1, code: '', status: 'active', name: draft.staff_name.trim(), position: '' } : undefined);
      if (!branch) throw new Error('Không tìm thấy cơ sở phụ trách. Hãy chọn lại thông tin rồi thử lại.');
      setDocument(buildContractDocument(draft, branch, representative || {id:-1,code:'',name:'',status:'active',position:''}));
    } catch (cause) {
      setSaveError(cause instanceof Error ? `Không tạo được mẫu hợp đồng: ${cause.message}` : 'Không tạo được mẫu hợp đồng. Vui lòng kiểm tra thông tin và thử lại.');
    }
  }
  const branchStaff = staffMatchesStore(staff, staffStoreId);
  const allVehicles = dataset?.vehicles || [];
  const branchVehicles = allVehicles.filter(vehicle => !staffStoreId || String(vehicle.store_id) === staffStoreId || draft.vehicles.some(item=>item.id===String(vehicle.id)));
  const branchName = dataset?.stores.find(store => String(store.id) === draft.store_id)?.name || '';
  const pricingVehicle = allVehicles.find(vehicle => String(vehicle.id) === draft.vehicles[0]?.id);
  const monthlyPackage = draft.package_name === 'Theo tháng';
  const ownership = rentalType === 'ownership';
  const requirements = documentRequirements(draft.document_requirements);
  useEffect(()=>{if (ownership) setRentalDays(rentalDayCount(draft.start_date,draft.end_date));},[ownership,draft.start_date,draft.end_date]);
  const ownershipPlan = useMemo(() => ownership ? createInstallmentPlan(draft.start_date, draft.end_date, draft.package_name, Number(draft.unit_price), draft.custom_installments) : null,
    [ownership, draft.start_date, draft.end_date, draft.package_name, draft.unit_price, draft.custom_installments]);
  const ownershipPeriods = ownershipPlan ? installmentSchedule(ownershipPlan) : [];
  const otherFees = chargeTotal(draft.extra_charges) ?? 0;
  useEffect(() => {
    if (row && row.status !== 'draft' || rentalTypePicked.current || ownership) return;
    if (isOwnershipStore(dataset?.stores.find(store => String(store.id) === staffStoreId)?.name)) {
      setRentalType('ownership'); setDraft(previous => ({ ...previous, ownership: true, package_name: 'Theo tháng' }));
    }
  }, [dataset?.stores, staffStoreId, row, ownership]);
  useEffect(() => {
    if (ownership || draft.package_name === 'Tùy chọn') return;
    const rate = monthlyPackage ? pricingVehicle?.monthly_price : draft.package_name === 'Theo tuần' && pricingVehicle?.daily_price != null ? Number(pricingVehicle.daily_price) * 7 : pricingVehicle?.daily_price;
    if (livePricing.current && String(pricingVehicle?.id) === livePricing.current.vehicle) return;
    if (pricingVehicle) {
      const nextRate = rate == null || !Number.isFinite(Number(rate)) ? '' : String(rate);
      setDraft(previous => previous.unit_price === nextRate ? previous : { ...previous, unit_price: nextRate });
    }
  }, [pricingVehicle, monthlyPackage, draft.package_name, ownership]);
  useEffect(() => {
    const live = livePricing.current;
    if (live && live.start === draft.start_date && live.end === draft.end_date && live.unit === draft.unit_price) return;
    const interval = billingInterval(draft.package_name);
    const units = ownership ? ownershipPlan ? 1 : 0 : interval ? rentalPeriodCount(draft.start_date, draft.end_date, interval) : 0;
    if (units && draft.unit_price && Number.isSafeInteger(Number(draft.unit_price))) {
      const total = String((ownership ? 1 : units) * Number(draft.unit_price)+otherFees);
      setDraft(previous => previous.total_amount === total && Boolean(previous.ownership) === ownership ? previous : { ...previous, ownership, total_amount: total });
    }
  }, [draft.start_date, draft.end_date, draft.unit_price, draft.package_name, draft.custom_installments, ownership, otherFees, ownershipPlan]);
  function changeCharges(next: ContractCharge[]) {
    setDraft(previous=>({...previous,extra_charges:next,total_amount:String(Math.max((Number(previous.total_amount)||0)-(chargeTotal(previous.extra_charges)||0),0)+(chargeTotal(next)||0))}));
    setSaveError('');setErrors(previous=>Object.fromEntries(Object.entries(previous).filter(([key])=>!key.startsWith('charge_') && key!=='extra_charges')));
  }
  function chooseVehicle(index: number, id: string) {
    const selected = allVehicles.find(item => String(item.id) === id);
    setDraft(previous => ({
      ...previous,
      ...(selected && index === 0 && selected.store_id ? { vehicle_store_id: String(selected.store_id),
        ...(contractStaffStoreId(previous) !== String(selected.store_id) ? {staff_id:'',staff_name:''} : {}) } : {}),
      vehicles: previous.vehicles.map((item, i) => i === index ? selected ? vehicleDetails(selected, previous.customer) : emptyVehicle() : item),
      unit_price: selected && index === 0 && !previous.unit_price ? String(selected.daily_price ?? '') : previous.unit_price,
    }));
    setErrors(previous => ({ ...previous, [`vehicle_${index}`]: '' }));
    setSaveError('');
  }
  const representative = branchStaff.find(person => String(person.id) === draft.staff_id) || (draft.staff_name.trim() ? { id: -1, code: '', status: 'active', name: draft.staff_name.trim(), position: '' } : undefined);
  const canSearchCustomer = /^\d{9,13}$/.test(String(idInput ?? '').replace(/\D/g, ''));
  const lookupText = lookupState === 'loading' ? 'Đang tra cứu khách hàng trên toàn hệ thống…' : lookupState === 'found' ? `Đã tìm thấy khách hàng #${draft.customer_id} · Thông tin đã tự động điền` : lookupState === 'matches' ? `Tìm thấy ${customerMatches.length} hồ sơ. Chọn đúng khách hàng bên dưới.` : lookupState === 'missing' ? 'Chưa có khách hàng mang giấy tờ hoặc số điện thoại này trên toàn hệ thống.' : 'Nhập CCCD/CMND hoặc số điện thoại (9–13 số) để tra cứu tất cả cơ sở.';
  const ownerStoreName = (customer: ManagementRow) => customer.store_name || dataset?.stores.find(store => store.id === customer.store_id)?.name || 'Chưa xác định';
  const firstRentalStoreName = (customer: ManagementRow) => customer.first_rental_store_name || (customer.first_rented_at ? 'Chưa xác định cơ sở' : 'Chưa có lịch sử thuê');
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
  async function persistProfile() {
    if(!row || !profileRevision || busy.current)return;busy.current=true;setSaving(true);setSaveError('');setProfileMessage('');
    try{const result=await saveContractProfile(row.id,profileRevision,contractProfile(draft));setProfileRevision(result.revision);setProfileMessage('Đã lưu hồ sơ và yêu cầu khi in. Tiền, công nợ và kho xe giữ theo giao dịch đã ghi.');void ensureData(['contracts'],true).catch(()=>{});}
    catch(cause){setSaveError(cause instanceof Error ? cause.message : 'Không lưu được hồ sơ.');}
    finally{busy.current=false;setSaving(false);}
  }
  function customerField(item: (typeof customerFields)[number]) {
    return <div className={`mg-field ${item.wide ? 'mg-field-wide' : ''}`} key={item.key}>
      <label htmlFor={`contract-customer-${item.key}`}>{item.label}</label>
      <input id={`contract-customer-${item.key}`} type={item.type || 'text'} value={draft.customer[item.key]}
        disabled={lookupState !== 'found'} aria-invalid={Boolean(errors[item.key])}
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
    <Dialog title={reserving ? 'Nhận cọc giữ xe' : editingDraft ? row ? 'Chỉnh sửa bản nháp' : 'Nhập hợp đồng' : mode === 'edit' ? 'Chỉnh sửa hợp đồng' : 'Điền và in hợp đồng'} subtitle={row ? `${row.code} · ID ${row.id}` : 'Bản nháp · Chưa cấp số hợp đồng'} className="mg-contract-composer" onClose={() => { if (!busy.current) onClose(); }}>
      <form ref={form} noValidate onSubmit={submit}>
        <div className="mg-dialog-body mg-composer-body">
          <div className="mg-composer-notice">{reserving ? 'Chọn khách, cơ sở giữ xe, xe và ngày dự kiến nhận. Tiền giữ xe được trừ vào tiền thuê; chỉ vào Sổ quỹ sau khi xác nhận khoản đã nhận. Lưu nháp chưa ghi tiền.' : canSaveDraft ? canSaveContractDrafts ? 'Lưu nháp giữ thông tin đang nhập trên hệ thống, kể cả khi chưa điền đủ. Vào mục Hợp đồng nháp để tiếp tục chỉnh sửa. Bản nháp chưa phát hành hợp đồng.' : 'Đang tra cứu dữ liệu hệ thống. Chức năng ghi bản nháp chưa được kết nối; thông tin đang nhập chưa được lưu.' : mode === 'edit' ? 'Hợp đồng đã có trong danh sách; bản in là bản nháp.' : 'Điền thông tin để xem và in mẫu hợp đồng.'}</div>
          <fieldset className="mg-composer-fields" disabled={saving}>
          <ContractSectionTabs prefix="contract-composer" active={section} onChange={setSection} />
          {panel('contract', 'Thông tin hợp đồng & Pháp lý', <>
            <div className="mg-form-grid mg-contract-grid-three">
              <div className="mg-field"><label htmlFor="contract-record-type">Loại hợp đồng</label><select id="contract-record-type" value={rentalType} onChange={event => { const next = event.target.value; rentalTypePicked.current = true; setRentalType(next); setDraft(previous => ({ ...previous, ownership: next === 'ownership', package_name: ['monthly', 'ownership'].includes(next) ? 'Theo tháng' : 'Theo ngày' })); }}>{CONTRACT_TYPES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
              {field('signed_on', 'Ngày ký hợp đồng', 'date', !reserving)}
              {field('contract_number', 'Mã hợp đồng / Số HĐ giấy')}
              {ownership && <div className="mg-field"><label htmlFor="contract-ownership-term">Thời hạn thuê sở hữu</label><select id="contract-ownership-term" value={draft.ownership_term_months || ownershipTerm(draft.start_date,draft.end_date)} onChange={event=>changeOwnershipTerm(event.target.value as OwnershipTerm)}>{OWNERSHIP_TERMS.map(term=><option key={term.value} value={term.value}>{term.label}</option>)}</select><small>Chọn 6, 12 hoặc 24 tháng để tính ngày kết thúc từ ngày bắt đầu thuê.</small></div>}
            </div>
            <div className="mg-form-grid mg-contract-grid-two mg-contract-subsection">
              <div className="mg-field"><label htmlFor="contract-created-on">Ngày tạo hợp đồng</label><input id="contract-created-on" type="date" value={draft.created_on} onChange={event => change('created_on', event.target.value)} /><small>Gợi ý hôm nay, có thể chọn ngày khác.</small></div>
              <div className="mg-field"><label htmlFor="contract-customer-source">Nguồn khách</label><input id="contract-customer-source" list="contract-staff-options" value={draft.customer_source} placeholder="Chọn hoặc nhập tên nhân sự" onChange={event => change('customer_source', event.target.value)} /></div>
              <div className="mg-field"><label htmlFor="contract-customer-source-store">Liên kết nguồn khách</label><select id="contract-customer-source-store" value={draft.customer_source_url || branchName} aria-invalid={Boolean(errors.store_id)} onChange={event => { const store = dataset?.stores.find(item=>item.name===event.target.value); if(store) changeSourceStore(String(store.id)); else change('customer_source_url',event.target.value); }}>
                <option value="">Chọn cơ sở</option>{(dataset?.stores || []).map(store => <option key={store.id} value={store.name}>{store.name}</option>)}
                {draft.customer_source_url && !(dataset?.stores || []).some(store => store.name === draft.customer_source_url) && <option value={draft.customer_source_url}>{draft.customer_source_url}</option>}
              </select><small>Cơ sở ghi nhận doanh thu hợp đồng, gợi ý theo hồ sơ khách.</small>{errors.store_id && <p className="mg-field-error">{errors.store_id}</p>}</div>
            </div>
            <div className="mg-form-grid mg-contract-grid-two mg-contract-subsection">
              {(['sales_staff_id','tls_staff_id'] as const).map(key=><div className="mg-field" key={key}><label htmlFor={`contract-${key}`}>{key === 'sales_staff_id' ? 'NVKD ghi nhận doanh số' : 'Nhân viên TLS giới thiệu khách'}</label><select id={`contract-${key}`} value={draft[key] || ''} onChange={event=>change(key,event.target.value)}><option value="">Chưa phân công</option>{dataset?.staff.filter(person=>staffIsAvailable(person) && staffRoles(person.position).includes(key === 'sales_staff_id' ? 'NVKD' : 'TLS')).map(person=><option key={person.id} value={person.id}>{person.name} · {person.code}</option>)}</select><small>{key === 'sales_staff_id' ? 'Tiền thuê thực thu của mọi khách, gồm gia hạn; không gồm cọc.' : 'Tiền thuê HĐ mở mới đầu tiên; sở hữu tính tổng lịch thuê. Không tính khách quay lại và gia hạn.'}</small></div>)}
              {attributionError && <p className="mg-field-error" role="alert">{attributionError}</p>}
            </div>
            <details className="mg-document-requirements"><summary>Yêu cầu hồ sơ khi in hợp đồng</summary><p>Lưu vận hành không bắt buộc người thân, địa chỉ hoặc CCCD chưa có. Chị có thể chọn các mục cần hoàn tất khi in; lựa chọn lưu cùng hợp đồng này.</p><div className="mg-form-grid mg-contract-grid-two">{(['phone','id_card','address','representative'] as const).map(key=><label className="mg-checkbox" key={key}><input type="checkbox" checked={requirements[key]} onChange={event=>change('document_requirements',{...requirements,[key]:event.target.checked})} />{{phone:'Số điện thoại khách',id_card:'CCCD/CMND',address:'Địa chỉ khách',representative:'Đại diện Bên A'}[key]}</label>)}<div className="mg-field"><label htmlFor="contract-required-relatives">Số người thân cần khi in</label><select id="contract-required-relatives" value={requirements.relatives} onChange={event=>change('document_requirements',{...requirements,relatives:Number(event.target.value) as 0|1|2})}><option value={0}>Không bắt buộc</option><option value={1}>1 người thân</option><option value={2}>2 người thân</option></select></div></div></details>
            <div className="mg-contract-record-status">{canSaveDraft ? <><span>Trạng thái hợp đồng</span><strong className="mg-status mg-status-amber">Lưu nháp</strong></> : mode === 'edit' ? <div className="mg-field"><label htmlFor="contract-record-status">Trạng thái hợp đồng</label><select id="contract-record-status" value={status} onChange={event => setStatus(event.target.value)}>{CONTRACT_STATUSES.filter(option => option.value !== 'draft').map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div> : null}</div>
          </>)}
          {panel('customer', 'Thông tin khách hàng (Bên B)', <>
            <div className="mg-form-grid mg-contract-grid-two">
              <div className="mg-field"><label htmlFor="contract-store">Cửa hàng xe *</label><select id="contract-store" value={staffStoreId} aria-invalid={Boolean(errors.vehicle_store_id)} onChange={event => changeVehicleStore(event.target.value)}>
                <option value="">Chọn cửa hàng xe</option>{dataset?.stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select><small>Chọn cửa hàng có xe để tải nhân viên làm hợp đồng.</small>{errors.vehicle_store_id && <p className="mg-field-error">{errors.vehicle_store_id}</p>}</div>
              <div className="mg-field"><label htmlFor="contract-staff">Đại diện ủy quyền Bên A (Nhân viên làm hợp đồng){requirements.representative ? ' · cần khi in' : ''}</label><input id="contract-staff" list="contract-staff-options" value={draft.staff_name || (branchStaff.find(person => String(person.id) === draft.staff_id)?.name || '')} disabled={!staffStoreId} aria-invalid={Boolean(errors.staff_id)} aria-describedby="contract-staff-help" placeholder={staffLoading ? 'Đang tải nhân sự…' : !staffStoreId ? 'Chọn cửa hàng xe trước' : 'Chọn hoặc nhập tên nhân sự'} onChange={event => {
                  const name = event.target.value;
                  const selected = branchStaff.find(person => person.name.toLocaleLowerCase('vi') === name.trim().toLocaleLowerCase('vi') && staffIsAvailable(person));
                  setDraft(previous => ({ ...previous, staff_id: selected ? String(selected.id) : '', staff_name: selected ? '' : name }));
                  setErrors(previous => ({ ...previous, staff_id: '' })); setSaveError('');
                }} />
                <datalist id="contract-staff-options">{branchStaff.filter(staffIsAvailable).map(person => <option key={person.id} value={person.name}>{person.code}</option>)}</datalist>
                {errors.staff_id && <p className="mg-field-error">{errors.staff_id}</p>}{staffError ? <div className="mg-field-error" role="alert">{staffError}<button className="mg-inline-button" type="button" onClick={() => setStaffRetry(value => value + 1)}>Thử lại</button></div> : <small id="contract-staff-help">{staffStoreId && !staffLoading ? `${branchStaff.filter(staffIsAvailable).length} nhân sự tại cửa hàng xe. Có thể chọn gợi ý hoặc nhập tên mới.` : 'Chọn cửa hàng xe để tải gợi ý nhân viên làm hợp đồng.'}</small>}</div>
            </div>
            <div className="mg-contract-customer-toolbar">
              <div className="mg-field mg-contract-lookup"><label htmlFor="contract-id-card">Tra cứu theo CCCD / CMND hoặc SĐT *</label><div className="mg-lookup-controls"><input id="contract-id-card" autoComplete="off" value={idInput} aria-invalid={Boolean(errors.id_card)} aria-describedby="contract-lookup-status" placeholder="CCCD/CMND hoặc SĐT · Tất cả cơ sở" onChange={event => changeIdentity(event.target.value)} />
                <button className="mg-button" type="button" disabled={!canSearchCustomer || lookupState === 'loading'} onClick={() => { preserveCustomer.current = false; setLookupRetry(value => value + 1); }}>{lookupState === 'loading' ? <LoaderCircle size={16} className="mg-spin" /> : <Search size={16} />}Tra cứu</button></div>
                <div id="contract-lookup-status" className={`mg-lookup-status is-${lookupState}`} role={lookupState === 'error' ? 'alert' : 'status'}>{lookupState === 'error' ? lookupError : lookupText}</div>{lookupState === 'found' && <span className={`mg-customer-status ${selectedCustomerStatus.includes('Cảnh báo') ? 'is-blocked' : selectedCustomerStatus === 'Có cảnh báo' ? 'is-warning' : selectedCustomerStatus === 'Đang hoạt động' ? 'is-active' : ''}`}>{selectedCustomerStatus}</span>}
                {lookupState === 'found' && selectedCustomer && <div className="mg-customer-origin">
                  <dl aria-label="Cơ sở của khách hàng"><div><dt>Cơ sở nguồn khách (hồ sơ)</dt><dd>{ownerStoreName(selectedCustomer)}</dd></div><div><dt>Cơ sở ghi nhận doanh thu hợp đồng</dt><dd>{branchName || 'Chưa chọn'}</dd></div><div><dt>Thuê lần đầu tại</dt><dd>{firstRentalStoreName(selectedCustomer)}</dd></div></dl>
                  {selectedCustomer.store_id && draft.store_id && String(selectedCustomer.store_id) !== draft.store_id && <p>Nguồn hồ sơ vẫn thuộc {ownerStoreName(selectedCustomer)}; hợp đồng này ghi nhận doanh thu tại {branchName}.</p>}
                </div>}
                {lookupState === 'matches' && <div className="mg-customer-match-list" role="listbox" aria-label="Chọn khách hàng tìm thấy">{customerMatches.map(customer => <button key={customer.id} type="button" role="option" aria-selected="false" className="mg-customer-match" onClick={() => selectCustomer(customer)}><strong>{customer.name}</strong><span>{customer.phone || 'Chưa có SĐT'} · CCCD {customer.id_card || 'Chưa có'}</span><span>Cơ sở quản lý: {ownerStoreName(customer)} · Thuê lần đầu: {firstRentalStoreName(customer)}</span><em>{customerStatusLabel(customer.status)}</em></button>)}</div>}
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
                return <div className="mg-field" key={key}><label htmlFor={`contract-relative-${index}-${key}`}>{labels[key]} người thân {index + 1}{!reserving && index < requirements.relatives && ' · cần khi in'}</label>
                  <input id={`contract-relative-${index}-${key}`} type={key === 'phone' ? 'tel' : 'text'} value={relative[key]} disabled={lookupState !== 'found'} aria-invalid={Boolean(errors[errorKey])} onChange={event => changeRelative(index as 0 | 1, key, event.target.value)} />
                  {errors[errorKey] && <p className="mg-field-error">{errors[errorKey]}</p>}</div>;
              })}</div>
            </div>)}</div>
            {reserving && <p className="mg-composer-hint">Có thể bổ sung địa chỉ, người thân và ngày ký trước khi in hợp đồng.</p>}
            <p className="mg-composer-hint">Thông tin chỉnh tại đây {mode === 'edit' ? 'được lưu riêng cho hợp đồng và mẫu in' : 'dùng trên bản in'}, không cập nhật hồ sơ khách hàng đã có.</p>
          </>)}
          {panel('vehicle', 'Thông tin phương tiện', <>
            <div className="mg-form-grid mg-contract-grid-two"><DateTime24Field id="contract-start_date" label={reserving ? 'Dự kiến nhận xe' : 'Thuê lúc'} value={draft.start_date} onChange={changeRentalStart} error={errors.start_date} /><DateTime24Field id="contract-end_date" label="Hẹn trả" value={draft.end_date} onChange={changeRentalEnd} error={errors.end_date} /></div>
            <div className="mg-form-grid mg-contract-grid-two"><div className="mg-field"><label htmlFor="contract-rental-days">Số ngày thuê</label><input id="contract-rental-days" type="number" min="1" step="1" value={rentalDays} aria-invalid={Boolean(errors.rental_days)} onChange={event=>changeRentalDays(event.target.value)} /><small>Nhập số ngày để tự tính ngày trả, giữ cùng giờ thuê. Có thể sửa hẹn trả trực tiếp.</small>{errors.rental_days && <p className="mg-field-error">{errors.rental_days}</p>}</div>
              <div className="mg-field"><label htmlFor="contract-vehicle-store-filter">Cửa hàng xe</label><select id="contract-vehicle-store-filter" value={staffStoreId} onChange={event=>changeVehicleStore(event.target.value)}><option value="">Chọn cửa hàng xe</option>{dataset?.stores.map(store=><option key={store.id} value={store.id}>{store.name}</option>)}</select><small>Cửa hàng có xe và gợi ý nhân viên làm hợp đồng. Lựa chọn được lưu cùng hợp đồng.</small></div></div>
            <p className="mg-composer-hint">Thời gian thuê và hẹn trả áp dụng cho các xe trong hợp đồng.</p>
            {draft.vehicles.map((vehicle, index) => {
              return <div key={index} className="mg-composer-vehicle"><div className="mg-composer-vehicle-header"><strong>Thông tin xe thuê số {index + 1}</strong>{draft.vehicles.length > 1 && <button className="mg-icon-button" type="button" aria-label={`Bỏ xe ${index + 1}`} onClick={() => change('vehicles', draft.vehicles.filter((_, i) => i !== index))}><Trash2 size={16} /></button>}</div>
              <div className="mg-field"><label htmlFor={`contract-vehicle-${index}`}>Chọn xe thuê *</label>
                <VehiclePicker id={`contract-vehicle-${index}`} index={index} vehicles={branchVehicles} value={vehicle.id} storeName={!staffStoreId ? 'tất cả cơ sở' : dataset?.stores.find(store=>String(store.id)===staffStoreId)?.name || 'cửa hàng xe'} monthly={monthlyPackage}
                  ownOrderId={row?.id} takenIds={draft.vehicles.map(item => item.id).filter(Boolean)} disabled={false} invalid={Boolean(errors[`vehicle_${index}`])} onChange={id => chooseVehicle(index, id)} />
                {errors[`vehicle_${index}`] && <p className="mg-field-error">{errors[`vehicle_${index}`]}</p>}</div>
              {vehicle.id && <div className="mg-composer-vehicle-summary">{vehicle.license} · {vehicle.brand} · {vehicle.type_text} · {vehicle.year || 'Chưa có năm sản xuất'}<br />Cơ sở quản lý xe: {vehicle.stock_store_name || allVehicles.find(item=>String(item.id)===vehicle.id)?.store_name || 'Chưa xác định'} · Doanh thu: {branchName || 'Chưa chọn nguồn khách'}</div>}
              <div className="mg-form-grid mg-contract-grid-three">{(['driver_name', 'driver_license_number', 'driver_license_issued_on', 'borrow_hats', 'borrow_raincoats', 'color'] as const).map(key => {
                const labels = { color: 'Màu xe', driver_name: 'Tên người lái', driver_license_number: 'Số giấy phép lái xe', driver_license_issued_on: 'Ngày cấp GPLX', borrow_hats: 'Số mũ mượn', borrow_raincoats: 'Số áo mưa' };
                return <div className="mg-field" key={key}><label htmlFor={`contract-vehicle-${index}-${key}`}>{labels[key]}</label><input id={`contract-vehicle-${index}-${key}`} type={key === 'driver_license_issued_on' ? 'date' : 'text'} inputMode={key.startsWith('borrow_') ? 'numeric' : undefined} maxLength={key.startsWith('borrow_') ? 2 : undefined} value={vehicle[key]} aria-invalid={Boolean(errors[`vehicle_${index}_${key}`])} onChange={event => change('vehicles', draft.vehicles.map((item, i) => i === index ? { ...item, [key]: key.startsWith('borrow_') ? event.target.value.replace(/\D/g, '').slice(0, 2) : event.target.value } : item))} />{errors[`vehicle_${index}_${key}`] && <p className="mg-field-error">{errors[`vehicle_${index}_${key}`]}</p>}</div>;
              })}</div>
            </div>;
            })}
            <button className="mg-button" type="button" onClick={() => change('vehicles', [...draft.vehicles, emptyVehicle()])}><Plus size={16} />Thêm xe</button>
          </>)}
          {panel('payment', 'Chi phí', <>
            {!reserving && <div className="mg-contract-cost-section"><h3>Tiền cọc</h3><div className="mg-form-grid mg-contract-grid-two">
              {moneyField('deposit_amount', 'Số tiền đặt cọc (VNĐ)')}{paymentMethodField('deposit_payment_method', 'Hình thức dự kiến nhận cọc')}
            </div></div>}
            <div className="mg-contract-cost-section"><h3>Phí thuê xe</h3><div className="mg-form-grid mg-contract-grid-two">
              <div className="mg-field"><label htmlFor="contract-package_name">{ownership ? 'Kỳ đóng tiền' : 'Gói thuê'}</label><select id="contract-package_name" value={draft.package_name} onChange={event => { const next = event.target.value; change('package_name', next); if (!ownership) setRentalType(next === 'Theo tháng' ? 'monthly' : 'daily'); }}><option value="Theo ngày">Theo ngày</option><option value="Theo tuần">Theo tuần</option><option value="Theo tháng">Theo tháng</option>{ownership && <option value="Tùy chọn">Tùy chọn ngày hẹn và số tiền</option>}</select></div>
              {moneyField('unit_price', draft.package_name === 'Tùy chọn' ? 'Số tiền thuê thu lần đầu (VNĐ)' : 'Đơn giá áp dụng (VNĐ)')}
              <div className="mg-field"><label htmlFor="contract-rental-base">{ownership ? 'Tiền thuê kỳ đầu (VNĐ)' : 'Tiền thuê xe (VNĐ)'}</label><input id="contract-rental-base" readOnly value={formatMoneyInput(String(Math.max((Number(draft.total_amount)||0)-otherFees,0)))}/></div>
              {paymentMethodField('payment_method', 'Hình thức dự kiến thu thuê/phí')}
            </div>{ownership && <div className="mg-composer-hint">
              <p>Thuê sở hữu đóng theo kỳ. Khi lập hợp đồng chỉ tính tiền cọc, kỳ đầu và phí khác.</p>
              {ownershipPlan ? <p>{ownershipPeriods.length} kỳ · Tiền thuê theo lịch: {ownershipPeriods.reduce((sum, period) => sum + period.amount, 0).toLocaleString('vi-VN')} đ (cọc riêng). Kỳ tiếp theo: {ownershipPeriods[1]?.due_at.replace('T', ' ') || 'Không còn kỳ tiếp theo'}. Các kỳ chưa đến hạn chưa tính vào công nợ.</p>
                : <p>Nhập thời hạn hợp lệ và đơn giá kỳ để lập lịch đóng tiền.</p>}
            </div>}</div>
            {ownership && draft.package_name === 'Tùy chọn' && <div className="mg-contract-cost-section"><h3>Lịch đóng tiền sau khoản đầu tiên</h3>
              <p className="mg-composer-hint">Kê ngày hẹn tăng dần và số tiền từng lần, trước ngày hết hạn hợp đồng. Tiền thuê lần đầu đã kê ở trên.</p>
              {(draft.custom_installments || []).map((item, index) => <div className="mg-form-grid mg-contract-grid-two" key={index}>
                <DateTime24Field id={`ownership-installment-${index}-due`} label={`Ngày hẹn lần ${index + 2}`} value={item.due_at} onChange={value => change('custom_installments', (draft.custom_installments || []).map((line, i) => i === index ? { ...line, due_at: value } : line))} />
                <div className="mg-field"><label htmlFor={`ownership-installment-${index}-amount`}>Số tiền lần {index + 2} (VNĐ)</label><input id={`ownership-installment-${index}-amount`} inputMode="numeric" value={formatMoneyInput(item.amount)} onChange={event => change('custom_installments', (draft.custom_installments || []).map((line, i) => i === index ? { ...line, amount: event.target.value.replace(/\D/g, '') } : line))} /></div>
                <button className="mg-button" type="button" onClick={() => change('custom_installments', (draft.custom_installments || []).filter((_, i) => i !== index))}><Trash2 size={16} />Bỏ lần {index + 2}</button>
              </div>)}
              <button className="mg-button" type="button" onClick={() => change('custom_installments', [...(draft.custom_installments || []), { due_at: '', amount: '' }])}><Plus size={16} />Thêm ngày hẹn đóng tiền</button>
            </div>}
            <div className="mg-contract-cost-section"><h3>Phí khác trong hợp đồng</h3>
              {(draft.extra_charges || []).map((item,index)=><div className="mg-extra-charge-row" key={index}>
                <div className="mg-field"><label htmlFor={`contract-charge-${index}-name`}>Tên khoản phí {index+1}</label><input id={`contract-charge-${index}-name`} value={item.name} maxLength={100} placeholder="Ví dụ: Phí ship" aria-invalid={Boolean(errors[`charge_${index}_name`])} onChange={event=>changeCharges((draft.extra_charges || []).map((row,i)=>i===index ? {...row,name:event.target.value} : row))}/>{errors[`charge_${index}_name`] && <p className="mg-field-error">{errors[`charge_${index}_name`]}</p>}</div>
                <div className="mg-field"><label htmlFor={`contract-charge-${index}-amount`}>Số tiền (VNĐ)</label><input id={`contract-charge-${index}-amount`} inputMode="numeric" value={formatMoneyInput(item.amount)} aria-invalid={Boolean(errors[`charge_${index}_amount`])} onChange={event=>changeCharges((draft.extra_charges || []).map((row,i)=>i===index ? {...row,amount:event.target.value.replace(/\D/g,'')} : row))}/>{errors[`charge_${index}_amount`] && <p className="mg-field-error">{errors[`charge_${index}_amount`]}</p>}</div>
                <button type="button" className="mg-icon-button" aria-label={`Bỏ khoản phí ${index+1}`} onClick={()=>changeCharges((draft.extra_charges || []).filter((_,i)=>i!==index))}><Trash2 size={16}/></button>
              </div>)}
              <button type="button" className="mg-button" disabled={(draft.extra_charges || []).length>=20} onClick={()=>changeCharges([...(draft.extra_charges || []),{name:'',amount:''}])}><Plus size={16}/>Thêm khoản phí</button>
              {errors.extra_charges && <p className="mg-field-error">{errors.extra_charges}</p>}
            </div>
            <div className="mg-form-grid mg-contract-grid-two">
              {moneyField('total_amount', ownership ? 'Tiền thuê kỳ đầu và phí khác (VNĐ)' : 'Tổng tiền thuê và phí khác (VNĐ)', true)}
              <div className="mg-field"><label htmlFor="contract-amount-due">Tổng cần thu gồm cọc (VNĐ)</label><input id="contract-amount-due" readOnly value={formatMoneyInput(String((Number(draft.deposit_amount)||0)+(Number(draft.total_amount)||0)))}/><small>Gồm cọc + tiền thuê + phí khác. Đây là số cần thu, chưa phải tiền đã nhận.</small></div>
            </div>
            <p className="mg-composer-hint">Bấm Lưu chính thức để chia số tiền đã nhận vào từng tài khoản/tiền mặt. Có thể ghi nhận cọc trước, thu nhiều lần hoặc để lại phần chưa thu.</p>
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
          </fieldset>{saveError && <p className="mg-error-message" role="alert">{saveError}</p>}{profileMessage && <p className="mg-payment-success" role="status">{profileMessage}</p>}
        </div>
        <div className="mg-dialog-footer"><span className="mg-form-note">{canSaveDraft ? 'Lưu vận hành trước; bổ sung hồ sơ khi in' : '* Theo yêu cầu hồ sơ khi in'}</span><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Đóng</button>
          {canSaveDraft && <button type="submit" value="draft" className="mg-button mg-button-primary" disabled={saving || !canSaveContractDrafts} title={!canSaveContractDrafts ? 'Chưa kết nối API lưu bản nháp' : undefined}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <Save size={16} />}{saving ? 'Đang lưu…' : 'Lưu nháp'}</button>}
          {canSaveDraft && source === 'api' && canSaveContractDrafts && <button type="submit" value="finalize" className="mg-button mg-button-finalize" disabled={saving || staffLoading || lookupState === 'loading'} title={reserving ? 'Xác nhận tiền giữ xe, tạo phiếu thu và chờ giao xe' : 'Kiểm tra đủ thông tin, cấp số hợp đồng và chuyển sang Đang thuê'}><CheckCircle2 size={16} />{reserving ? 'Ghi nhận cọc giữ xe' : 'Lưu chính thức'}</button>}
          {mode === 'edit' && !canSaveDraft && <button type="submit" className="mg-button mg-button-primary" disabled={saving || staffLoading || lookupState === 'loading'}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <Save size={16} />}{saving ? 'Đang lưu…' : 'Lưu hợp đồng'}</button>}
          {row && !canSaveDraft && source === 'api' && <button type="button" className="mg-button" disabled={saving || !profileRevision} onClick={()=>void persistProfile()}><Save size={16}/>Lưu hồ sơ hợp đồng</button>}
          <button type="submit" value="preview" className={`mg-button${mode === 'print' ? ' mg-button-primary' : ''}`} disabled={saving || staffLoading || lookupState === 'loading'}><Printer size={16} />Xem mẫu in</button></div>
      </form>
    </Dialog>
    {customerModal && <CustomerCreateDialog allowIncomplete idCard={/^\d{9}$|^\d{12}$/.test(normalizeIdCard(idInput)) ? normalizeIdCard(idInput) : ''} storeId={draft.store_id} onCreated={customerCreated} onClose={() => setCustomerModal(false)} />}
    {document && <ContractPrintPreview doc={document} onClose={() => setDocument(null)} />}
    {finalizeTarget && <ContractFinalizeDialog orderId={finalizeTarget.id} revision={finalizeTarget.revision} code={finalizeTarget.code}
      total={Number(draft.total_amount) || 0} deposit={Number(draft.deposit_amount) || 0} reservation={reserving}
      depositMethods={draftPaymentMethods(draft.deposit_payment_method)} rentalMethods={draftPaymentMethods(draft.payment_method)} charges={draft.extra_charges}
      onClose={() => setFinalizeTarget(null)} onDone={result => { setFinalizeTarget(null); onClose(); onFinalized?.(result); }} />}
  </>;
}
